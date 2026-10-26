(() => {
  const config = window.CLARITYGRID_STORE_CONFIG;
  const products = window.CLARITYGRID_PRODUCTS;
  const licenses = window.CLARITYGRID_LICENSES;
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const catalog = document.querySelector("#catalog-grid");
  const featured = document.querySelector("#featured-grid");
  const status = document.querySelector("#store-status");
  const dialog = document.querySelector("#product-dialog");
  const dialogBody = document.querySelector("#product-dialog-body");
  const closeDialog = document.querySelector("#close-product-dialog");

  status.textContent = config.launchStatus;

  const card = (product, compact = false) => {
    const article = document.createElement("article");
    article.className = compact ? "product-card product-card-featured" : "product-card";
    article.innerHTML = `
      <p class="product-category">${product.category}</p>
      <h3>${product.name}</h3>
      <p>${product.summary}</p>
      <div class="product-price"><span>Launch price</span><strong>${money.format(product.launch)}</strong></div>
      <button class="button secondary" type="button" data-product="${product.sku}">View product details</button>`;
    return article;
  };

  products.filter((item) => item.featured).forEach((item) => featured.append(card(item, true)));
  products.forEach((item) => catalog.append(card(item)));

  const showProduct = (sku) => {
    const product = products.find((item) => item.sku === sku);
    if (!product) return;
    const options = ["launch", "business", "consultant", "firm"].map((license) => `
      <label class="license-choice">
        <input type="radio" name="license" value="${license}" ${license === "business" ? "checked" : ""}>
        <span><strong>${license[0].toUpperCase() + license.slice(1)} — ${money.format(product[license])}</strong><small>${licenses[license]}</small></span>
      </label>`).join("");
    dialogBody.innerHTML = `
      <p class="product-category">${product.category} · ${product.sku}</p>
      <h2>${product.name}</h2>
      <p>${product.summary}</p>
      <fieldset><legend>Select a license for review</legend>${options}</fieldset>
      <p class="notice">Checkout remains disabled until pricing, licenses, product files and delivery testing receive final approval.</p>
      <div class="dialog-actions">
        <button class="button" id="checkout-button" type="button" ${config.checkoutEnabled ? "" : "disabled"}>${config.checkoutEnabled ? "Continue to secure checkout" : "Checkout pending approval"}</button>
        <a class="text-link" href="mailto:${config.informationEmail}?subject=${encodeURIComponent(`Product information request — ${product.name}`)}">Request product information</a>
      </div>`;
    dialog.showModal();
    dialog.querySelector("#checkout-button")?.addEventListener("click", async () => {
      const license = dialog.querySelector('input[name="license"]:checked')?.value;
      const button = dialog.querySelector("#checkout-button");
      if (!config.checkoutEnabled || !config.checkoutApiBase) return;
      button.disabled = true;
      button.textContent = "Preparing secure checkout…";
      try {
        const response = await fetch(`${config.checkoutApiBase}/create-checkout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sku: product.sku, license })
        });
        if (!response.ok) throw new Error("Checkout could not be prepared.");
        const result = await response.json();
        window.location.assign(result.url);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Try secure checkout again";
        dialog.querySelector(".notice").textContent = "Checkout is temporarily unavailable. Please request product information for assistance.";
      }
    });
  };

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-product]");
    if (trigger) showProduct(trigger.dataset.product);
  });
  closeDialog.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
})();
