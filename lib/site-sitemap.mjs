import fs from 'node:fs';
import path from 'node:path';

// Used by the existing static product build and the atomic notice publication snapshot.
export function renderSiteSitemap(data, { root, siteUrl = 'https://nothingmatters.co.kr' }) {
  const entries = [
    ...data.pages.filter(page => page.sitemap && page.indexing === 'index').map(page => ({ loc: siteUrl + page.path, lastmod: page.lastmod })),
    ...data.products.filter(product => ['generated', 'existing'].includes(product.detailPageMode) && fs.existsSync(path.join(root, product.primaryUrl.slice(1), 'index.html'))).map(product => ({ loc: siteUrl + product.primaryUrl, lastmod: product.updatedAt }))
  ];
  const seen = new Set();
  const body = entries.filter(entry => { if (seen.has(entry.loc)) return false; seen.add(entry.loc); return true; })
    .map(entry => `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
