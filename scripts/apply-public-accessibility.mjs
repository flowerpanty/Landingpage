import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_PAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site-pages.json"), "utf8"));
const SKIP_MARKER = "data-nm-skip-link";
const STYLE_MARKER = "data-nm-accessibility";
const SKIP_STYLE = `<style ${STYLE_MARKER}>
  .nm-skip-link { position: fixed; z-index: 10000; top: -80px; left: 12px; min-height: 44px; padding: 11px 16px; color: #111; background: #fff4cf; border: 3px solid #111; border-radius: 999px; font: 800 14px/1.2 system-ui, sans-serif; text-decoration: none; transition: top .16s ease; }
  .nm-skip-link:focus { top: 12px; }
  :focus-visible { outline: 3px solid #111; outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; } }
</style>`;

function shouldSkipDirectory(name, relativePath) {
  if ([".git", ".playwright-cli", "node_modules", "dashboard", "gallery-admin"].includes(name)) return true;
  return relativePath === "out/_next" || relativePath === "out/_not-found";
}

function findPublicIndexFiles(directory = ROOT, relativePath = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelativePath = path.join(relativePath, entry.name);
    const childPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name, childRelativePath.split(path.sep).join("/"))) {
        files.push(...findPublicIndexFiles(childPath, childRelativePath));
      }
      continue;
    }
    if (entry.name === "index.html") files.push(childPath);
  }
  return files.sort();
}

function homeHrefFor(filePath) {
  const directory = path.dirname(filePath);
  const relative = path.relative(directory, path.join(ROOT, "index.html")).split(path.sep).join("/");
  return relative === "index.html" ? "./" : relative;
}

function pathnameFor(filePath) {
  const relative = path.relative(ROOT, filePath).split(path.sep).join("/");
  return relative === "index.html" ? "/" : `/${relative.replace(/\/index\.html$/, "/")}`;
}

function addAccessibilityContract(html, filePath) {
  let next = html;
  const homeHref = homeHrefFor(filePath);
  const registryEntry = (SITE_PAGES.pages || []).find((page) => page.path === pathnameFor(filePath));
  let mainTarget = "main-content";
  const mainMatch = next.match(/<main\b[^>]*>/i);

  if (mainMatch) {
    const openingTag = mainMatch[0];
    const existingId = openingTag.match(/\bid=["']([^"']+)["']/i)?.[1];
    mainTarget = existingId || "main-content";
    let updatedTag = openingTag;
    if (!existingId) updatedTag = updatedTag.replace(/<main\b/i, `<main id="${mainTarget}"`);
    if (!/\btabindex=["']-1["']/i.test(updatedTag)) {
      updatedTag = updatedTag.replace(/<main\b([^>]*)>/i, `<main$1 tabindex="-1">`);
    }
    next = next.replace(openingTag, updatedTag);
  } else {
    next = next.replace(/(<body\b[^>]*>)([\s\S]*)(<\/body>)/i, `$1\n<main id="${mainTarget}" tabindex="-1">$2\n</main>$3`);
  }

  if (!next.includes(SKIP_MARKER)) {
    const skipLink = `<a ${SKIP_MARKER} class="nm-skip-link" href="#${mainTarget}">본문으로 건너뛰기</a>`;
    next = next.replace(/(<body\b[^>]*>)/i, `$1\n${skipLink}`);
  }

  if (!next.includes(STYLE_MARKER)) {
    next = next.replace(/<\/head>/i, `${SKIP_STYLE}\n</head>`);
  }

  if (registryEntry?.indexing === "noindex" && !/<meta\b[^>]*name=["']robots["'][^>]*\bnoindex\b/i.test(next)) {
    next = next.replace(/<\/head>/i, '<meta name="robots" content="noindex,follow">\n</head>');
  }

  next = next.replace(
    /<div(\s+class=["'][^"']*\bnm-logo\b[^"']*["'])>([\s\S]*?)<\/div>/gi,
    `<a$1 href="${homeHref}" aria-label="낫띵메터스 홈으로 이동">$2</a>`
  );
  next = next.replace(
    /(<a\b[^>]*class=["'][^"']*\bshowroom-logo\b[^"']*["'][^>]*\bhref=["'])#[^"']*(["'])/gi,
    `$1${homeHref}$2`
  );
  next = next.replace(
    /(<a\b[^>]*class=["'][^"']*\bnm-logo\b[^"']*["'][^>]*\bhref=["'][^"']*)#mainpage-home(["'])/gi,
    `$1$2`
  );

  return next;
}

let changed = 0;
for (const filePath of findPublicIndexFiles()) {
  const source = fs.readFileSync(filePath, "utf8");
  const next = addAccessibilityContract(source, filePath);
  if (next === source) continue;
  fs.writeFileSync(filePath, next);
  changed += 1;
}

console.log(`public accessibility: updated ${changed} pages`);
