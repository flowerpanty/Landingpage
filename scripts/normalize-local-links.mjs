import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const walk = async (dir, files = []) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile() && entry.name === "index.html") {
      files.push(fullPath);
    }
  }

  return files;
};

const normalizeLinks = (html) =>
  html
    .replace(
      /href="((?:\.\.\/|\.\/)*)contact\/"/g,
      (_, prefix) => `href="${prefix}contact/index.html"`
    )
    .replace(
      /href="((?:\.\.\/|\.\/)*)guides\/"/g,
      (_, prefix) => `href="${prefix}guides/index.html"`
    )
    .replace(
      /href="((?:\.\.\/|\.\/)*)(products|guides)\/([a-z0-9-]+)\/"/g,
      (_, prefix, group, slug) =>
        `href="${prefix}${group}/${slug}/index.html"`
    )
    .replace(
      /href="\.\/([a-z0-9-]+)\/"/g,
      (_, slug) => `href="./${slug}/index.html"`
    )
    .replace(
      /href="\.\.\/([a-z0-9-]+)\/"/g,
      (_, slug) => `href="../${slug}/index.html"`
    )
    .replace(
      /href="\.\.\/\.\.\/([a-z0-9-]+)\/"/g,
      (_, slug) => `href="../../${slug}/index.html"`
    );

const run = async () => {
  const files = await walk(rootDir);

  await Promise.all(
    files.map(async (file) => {
      const html = await fs.readFile(file, "utf8");
      const normalized = normalizeLinks(html);

      if (normalized !== html) {
        await fs.writeFile(file, normalized, "utf8");
      }
    })
  );
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
