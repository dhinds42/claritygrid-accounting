# ClarityGrid automatic product delivery worker

This Cloudflare Worker is intentionally disabled until payment, licensing, email and delivery testing are approved.

## Workflow

1. The storefront requests a Stripe Checkout Session for an approved SKU and license.
2. Stripe collects payment and calculates applicable tax.
3. A verified Stripe webhook triggers fulfillment only after payment is marked paid.
4. The Worker creates a random, expiring, limited-use download token in Cloudflare KV.
5. The private ZIP stays in R2; the Worker streams it only through a valid token.
6. Zoho ZeptoMail sends the download link.
7. An optional Zoho Flow webhook creates or updates the CRM customer and order.
8. A refund event revokes the related download token.

## Required Cloudflare resources

- Pages project rooted at `product-store`, build command `npm run build`, output `dist`.
- Worker using `worker/src/index.js`.
- Private R2 bucket named `claritygrid-digital-products`.
- KV namespace for download tokens and webhook idempotency.
- Custom domains `products.claritygridaccounting.com` and `downloads.claritygridaccounting.com` after approval.

## Required secrets

Set secrets only in Cloudflare; never commit them:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STORE_CONFIG_JSON`
- `ZEPTOMAIL_TOKEN`
- `ZOHO_FLOW_WEBHOOK_URL`
- `ZOHO_FLOW_WEBHOOK_SECRET`

`STORE_CONFIG_JSON` maps each SKU and license to its Stripe Price and private R2 file. Example:

```json
{"CG-FCT":{"business":{"priceId":"price_REPLACE","r2Key":"v1/CG-FCT.zip","filename":"ClarityGrid_Fleet_Financial_Control_Tower_v1.0.zip","name":"Fleet Financial Control Tower"}}}
```

## Launch control

Keep `CHECKOUT_ENABLED=false` and `checkoutEnabled:false` in `config.js` until all test purchases, delivery emails, license documents, refunds and download limits pass review. After approval, change both controls together and redeploy.
