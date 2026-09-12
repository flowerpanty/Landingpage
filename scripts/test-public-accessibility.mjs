import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([".git", ".playwright-cli", "node_modules", "dashboard", "gallery-admin"]);

function discover(directory = ROOT, relativePath = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelativePath = path.join(relativePath, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name) || childRelativePath === "out/_next" || childRelativePath === "out/_not-found") continue;
      files.push(...discover(path.join(directory, entry.name), childRelativePath));
    } else if (entry.name === "index.html") {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

for (const filePath of discover()) {
  const relative = path.relative(ROOT, filePath);
  const html = fs.readFileSync(filePath, "utf8");
  const skip = html.match(/<a\b[^>]*data-nm-skip-link[^>]*href=["']#([^"']+)["'][^>]*>/i);
  assert.ok(skip, `${relative}: missing skip link`);
  assert.match(html, new RegExp(`<main\\b[^>]*\\bid=["']${skip[1]}["']`, "i"), `${relative}: skip target is not a main landmark`);
  assert.match(html, /data-nm-accessibility/, `${relative}: missing focus and reduced-motion contract`);

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    assert.match(image[0], /\balt\s*=/i, `${relative}: image missing alt attribute`);
  }

  const headingLevels = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  assert.ok(headingLevels.includes(1), `${relative}: missing h1`);
  assert.equal(
    headingLevels.some((level, index) => index > 0 && level > headingLevels[index - 1] + 1),
    false,
    `${relative}: heading level jumps by more than one`
  );

  for (const logo of html.matchAll(/<(?:a|div)\b[^>]*class=["'][^"']*\b(?:nm-logo|showroom-logo)\b[^"']*["'][^>]*>/gi)) {
    assert.match(logo[0], /<a\b[^>]*\bhref=["'][^"']+["']/i, `${relative}: logo must link home`);
  }
}

console.log(`public accessibility checks: passed ${discover().length} pages`);
