import {readFile} from 'node:fs/promises';
for (const path of ['product-store/config.js', 'product-store/dist/config.js']) {
  if (!(await readFile(path, 'utf8')).includes('checkoutEnabled: false')) throw new Error(`${path}: checkout must remain disabled`);
}
if (!(await readFile('product-store/worker/wrangler.toml', 'utf8')).includes('CHECKOUT_ENABLED = "false"')) throw new Error('Worker checkout must remain disabled');
console.log('Storefront and Worker checkout remain disabled.');
