import {cp, mkdir, readdir, rm} from 'node:fs/promises';
// Deploy only the marketing site. The commercial storefront remains separate.
const excluded = new Set(['.git', '.github', '.openai', 'node_modules', 'dist', 'scripts', 'product-store', 'reports']);
await rm('dist', {recursive: true, force: true});
await mkdir('dist', {recursive: true});
for (const entry of await readdir('.', {withFileTypes: true})) {
  if (excluded.has(entry.name) || entry.name.startsWith('.')) continue;
  if (entry.isDirectory() || /\.(html|css|js|svg|xml|txt)$/.test(entry.name) || ['_headers', 'CNAME'].includes(entry.name)) {
    await cp(entry.name, `dist/${entry.name}`, {recursive: true, filter: source => !/(?:^|\/)(?:business-card[^/]*|ClarityGrid-Brand-Application-Pack\.zip)$/.test(source)});
  }
}
console.log('Built marketing site in dist; commercial storefront excluded.');
