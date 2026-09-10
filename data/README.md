# Product catalog

`products.json` is the homepage product source.

- `status: "new"` adds the product to `NEW ARRIVAL`.
- Every product is added to `OUR COOKIES`.
- `detailPageMode: "generated"` creates `/products/{slug}/index.html` from the shared template.
- `detailPageMode: "existing"` keeps the current hand-written product page.
- Update `updatedAt` when a generated product changes.

After editing the catalog, run:

```bash
npm run site:build
npm run site:check
```
