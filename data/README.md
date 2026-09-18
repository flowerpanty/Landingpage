# Public site registry

`site-pages.json` is the canonical registry for public routes, redirects, indexing, sitemap inclusion, product primary URLs, product order URLs, and product schema metadata. Build and SEO checks consume it directly; do not add a second product metadata map in scripts.

- `cardStatus: "new"` adds a `NEW` badge inside `OUR COOKIES`; every registry product is added to the product grid. The `NM_NEW_ARRIVAL` build marker remains as an intentionally empty contract block.
- `detailPageMode: "generated"` creates `/products/{slug}/index.html` from the shared template.
- `detailPageMode: "existing"` keeps the current hand-written product page.
- Update `updatedAt` when a generated product changes.

After editing the catalog, run:

```bash
npm run site:build
npm run site:check
```
