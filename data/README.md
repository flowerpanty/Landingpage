# Public site registry

`site-pages.json` is the canonical registry for public routes, redirects, indexing, sitemap inclusion, product primary URLs, product order URLs, and product schema metadata. Build and SEO checks consume it directly; do not add a second product metadata map in scripts.

- `cardStatus: "new"` adds a product to `NEW ARRIVAL`; every registry product is added to `OUR COOKIES`.
- `detailPageMode: "generated"` creates `/products/{slug}/index.html` from the shared template.
- `detailPageMode: "existing"` keeps the current hand-written product page.
- Update `updatedAt` when a generated product changes.

After editing the catalog, run:

```bash
npm run site:build
npm run site:check
```
