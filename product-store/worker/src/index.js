const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return corsResponse(request, env, null, 204);
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return corsResponse(request, env, { status: "ok", checkout: env.CHECKOUT_ENABLED === "true" });
      }
      if (url.pathname === "/create-checkout" && request.method === "POST") {
        return await createCheckout(request, env);
      }
      if (url.pathname === "/stripe-webhook" && request.method === "POST") {
        return await handleStripeWebhook(request, env);
      }
      if (url.pathname.startsWith("/download/") && request.method === "GET") {
        return await deliverDownload(url.pathname.slice("/download/".length), env);
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error(error);
      return corsResponse(request, env, { error: "The request could not be completed." }, 500);
    }
  }
};

async function createCheckout(request, env) {
  if (env.CHECKOUT_ENABLED !== "true") return corsResponse(request, env, { error: "Checkout is not active." }, 503);
  if (!isAllowedOrigin(request, env)) return new Response("Origin not allowed", { status: 403 });
  const { sku, license } = await request.json();
  const catalog = JSON.parse(env.STORE_CONFIG_JSON || "{}");
  const selection = catalog?.[sku]?.[license];
  if (!selection?.priceId || !selection?.r2Key) return corsResponse(request, env, { error: "Invalid product selection." }, 400);
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", selection.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", `${env.STORE_PUBLIC_URL}/?order=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${env.STORE_PUBLIC_URL}/?order=cancelled`);
  form.set("metadata[product_sku]", sku);
  form.set("metadata[license]", license);
  form.set("automatic_tax[enabled]", "true");
  form.set("billing_address_collection", "required");
  form.set("customer_creation", "always");
  form.set("allow_promotion_codes", "false");
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: form
  });
  const result = await response.json();
  if (!response.ok || !result.url) {
    console.error("Stripe checkout error", JSON.stringify(result));
    return corsResponse(request, env, { error: "Secure checkout is unavailable." }, 502);
  }
  return corsResponse(request, env, { url: result.url });
}

async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  if (await env.DOWNLOAD_TOKENS.get(`event:${event.id}`)) return new Response("Already processed", { status: 200 });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return new Response("Payment incomplete", { status: 200 });
    await fulfillOrder(session, env);
  }
  if (event.type === "charge.refunded") {
    await revokePaymentDownloads(event.data.object.payment_intent, env);
  }
  await env.DOWNLOAD_TOKENS.put(`event:${event.id}`, "complete", { expirationTtl: 60 * 60 * 24 * 30 });
  return new Response("Accepted", { status: 200 });
}

async function fulfillOrder(session, env) {
  const sku = session.metadata?.product_sku;
  const license = session.metadata?.license;
  const catalog = JSON.parse(env.STORE_CONFIG_JSON || "{}");
  const product = catalog?.[sku]?.[license];
  const email = session.customer_details?.email || session.customer_email;
  if (!product?.r2Key || !email) throw new Error("Order is missing product delivery data.");
  const object = await env.PRODUCT_FILES.head(product.r2Key);
  if (!object) throw new Error(`Product file not found: ${product.r2Key}`);

  const token = randomToken();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * Number(env.DOWNLOAD_EXPIRY_DAYS || 7);
  const record = {
    r2Key: product.r2Key,
    filename: product.filename || `${sku}.zip`,
    sku,
    license,
    orderId: session.id,
    email,
    downloads: 0,
    maxDownloads: Number(env.MAX_DOWNLOADS || 3),
    expiresAt
  };
  await env.DOWNLOAD_TOKENS.put(`download:${token}`, JSON.stringify(record), { expiration: Math.floor(expiresAt / 1000) });
  if (session.payment_intent) {
    await env.DOWNLOAD_TOKENS.put(`payment:${session.payment_intent}`, JSON.stringify([token]), { expirationTtl: 60 * 60 * 24 * 180 });
  }
  const downloadUrl = `${env.PUBLIC_WORKER_URL}/download/${token}`;
  await sendDeliveryEmail(email, product.name || sku, license, downloadUrl, record, env);
  await notifyZoho({ session, sku, license, email, productName: product.name || sku }, env);
}

async function deliverDownload(token, env) {
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Invalid download link", { status: 400 });
  const key = `download:${token}`;
  const raw = await env.DOWNLOAD_TOKENS.get(key);
  if (!raw) return downloadMessage("This download link is invalid or has expired.", 404);
  const record = JSON.parse(raw);
  if (Date.now() > record.expiresAt) return downloadMessage("This download link has expired.", 410);
  if (record.downloads >= record.maxDownloads) return downloadMessage("This download limit has been reached. Contact ClarityGrid for assistance.", 410);
  const object = await env.PRODUCT_FILES.get(record.r2Key);
  if (!object) return downloadMessage("The product file is temporarily unavailable.", 503);
  record.downloads += 1;
  const ttl = Math.max(60, Math.floor((record.expiresAt - Date.now()) / 1000));
  await env.DOWNLOAD_TOKENS.put(key, JSON.stringify(record), { expirationTtl: ttl });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", object.httpMetadata?.contentType || "application/zip");
  headers.set("content-disposition", `attachment; filename="${safeFilename(record.filename)}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function revokePaymentDownloads(paymentIntent, env) {
  if (!paymentIntent) return;
  const raw = await env.DOWNLOAD_TOKENS.get(`payment:${paymentIntent}`);
  if (!raw) return;
  const tokens = JSON.parse(raw);
  await Promise.all(tokens.map((token) => env.DOWNLOAD_TOKENS.delete(`download:${token}`)));
  await env.DOWNLOAD_TOKENS.delete(`payment:${paymentIntent}`);
}

async function sendDeliveryEmail(to, productName, license, downloadUrl, record, env) {
  if (!env.ZEPTOMAIL_TOKEN) throw new Error("Transactional email is not configured.");
  const body = {
    from: { address: env.FROM_EMAIL, name: env.FROM_NAME || "ClarityGrid Accounting & Advisory" },
    to: [{ email_address: { address: to } }],
    subject: `Your ClarityGrid download — ${productName}`,
    htmlbody: `<div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.6;max-width:650px"><h1 style="color:#0b2239">Your ClarityGrid product is ready</h1><p>Thank you for your purchase of <strong>${escapeHtml(productName)}</strong> (${escapeHtml(license)} license).</p><p><a href="${downloadUrl}" style="display:inline-block;background:#0b2239;color:#fff;padding:13px 18px;text-decoration:none">Download your product</a></p><p>This link expires in ${Number(env.DOWNLOAD_EXPIRY_DAYS || 7)} days and permits up to ${record.maxDownloads} downloads.</p><p>Keep the product and license materials together. Contact <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a> if you need assistance.</p><hr><p style="font-size:12px;color:#566473">ClarityGrid digital products are configurable financial-operations tools. Customers remain responsible for their data, decisions, configuration and professional review.</p></div>`
  };
  const response = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: { authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`ZeptoMail delivery failed: ${response.status}`);
}

async function notifyZoho(order, env) {
  if (!env.ZOHO_FLOW_WEBHOOK_URL) return;
  const response = await fetch(env.ZOHO_FLOW_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-claritygrid-secret": env.ZOHO_FLOW_WEBHOOK_SECRET || "" },
    body: JSON.stringify({
      event: "digital_product_purchase",
      order_id: order.session.id,
      payment_intent: order.session.payment_intent,
      amount_total: order.session.amount_total,
      currency: order.session.currency,
      customer_email: order.email,
      customer_name: order.session.customer_details?.name || "",
      product_sku: order.sku,
      product_name: order.productName,
      license: order.license,
      created_at: new Date().toISOString()
    })
  });
  if (!response.ok) console.error("Zoho notification failed", response.status);
}

async function verifyStripeSignature(payload, header, secret) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return timingSafeEqual(hex(signature), parts.v1 || "");
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  return allowedOrigins(env).includes(origin);
}
function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
}
function corsResponse(request, env, data, status = 200) {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers(JSON_HEADERS);
  if (allowedOrigins(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "origin");
  return new Response(data === null ? null : JSON.stringify(data), { status, headers });
}
function downloadMessage(message, status) {
  return new Response(`<!doctype html><title>ClarityGrid download</title><meta name="viewport" content="width=device-width"><main style="max-width:650px;margin:12vh auto;font-family:Arial;padding:24px"><h1 style="color:#0b2239">ClarityGrid download</h1><p>${escapeHtml(message)}</p><p><a href="https://www.claritygridaccounting.com/contact/">Contact ClarityGrid</a></p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
function randomToken() {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function hex(buffer) { return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
function safeFilename(value) { return String(value).replace(/[^a-zA-Z0-9._-]/g, "_"); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
