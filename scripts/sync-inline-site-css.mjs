import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const targets = [
  "index.html",
  "bulk/index.html",
  "small-gift/index.html",
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
  "products/terminal-sand-cookie/index.html"
];

const stripInlineCss = (html) =>
  html.replace(/\n?\s*<style id="nm-inline-site-css">[\s\S]*?<\/style>\s*/g, "\n");

const run = async () => {
  await Promise.all(
    targets.map(async (target) => {
      const filePath = path.join(rootDir, target);
      const html = await fs.readFile(filePath, "utf8");
      const next = stripInlineCss(html);

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
