import { cp, mkdir, rm } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "catalog.js",
  "app.js",
  "config.js",
  "privacy.html",
  "terms.html",
  "accessibility.html",
  "robots.txt",
  "sitemap.xml"
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all(files.map((file) => cp(file, `dist/${file}`)));
console.log(`Built ${files.length} product-store files.`);
