import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cssPath = path.join(rootDir, "assets", "site.css");

const targets = [
  "index.html",
  "contact/index.html",
  "guides/index.html",
  "guides/wedding-favor-cookie/index.html",
  "guides/corporate-event-cookie/index.html",
  "guides/teacher-snack-gift/index.html",
  "guides/farewell-favor-cookie/index.html",
  "guides/dessert-gift-set/index.html",
  "guides/lucky-cheering-cookie/index.html",
  "products/brownie-cookie/index.html",
  "products/custom-brownie-cookie/index.html",
  "products/handmade-cookie/index.html",
  "products/lucky-cookie/index.html",
  "products/scone/index.html",
  "products/terminal-sand-cookie/index.html",
];

const STYLE_OPEN = '<style id="nm-inline-site-css">';
const STYLE_CLOSE = "</style>";

const rewriteInlineAssetUrls = (css, target) => {
  const fromDir = path.dirname(path.join(rootDir, target));
  const relativeToRoot = path.relative(fromDir, rootDir).split(path.sep).join("/");
  const assetPrefix = relativeToRoot ? `${relativeToRoot}/` : "";

  return css.replaceAll("../images/", `${assetPrefix}images/`);
};

const replaceInlineCss = (html, css, target) => {
  const normalizedCss = rewriteInlineAssetUrls(css, target);
  const inlineBlock = `${STYLE_OPEN}\n${normalizedCss}\n  ${STYLE_CLOSE}`;

  if (html.includes(STYLE_OPEN)) {
    return html.replace(
      /<style id="nm-inline-site-css">[\s\S]*?<\/style>/,
      inlineBlock
    );
  }

  return html.replace(
    /(<link[^>]+site\.css[^>]*>\s*)/,
    `$1${inlineBlock}\n`
  );
};

const run = async () => {
  const css = await fs.readFile(cssPath, "utf8");

  await Promise.all(
    targets.map(async (target) => {
      const filePath = path.join(rootDir, target);
      const html = await fs.readFile(filePath, "utf8");
      const next = replaceInlineCss(html, css, target);

      if (next !== html) {
        await fs.writeFile(filePath, next, "utf8");
      }
    })
  );
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
