import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const documents = [
  "README.md",
  ...readdirSync("docs")
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs", name)),
];
let links = 0;
for (const document of documents) {
  const markdown = readFileSync(document, "utf8").replace(
    /```[\s\S]*?```/g,
    "",
  );
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "");
    if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const path = resolve(
      dirname(document),
      decodeURIComponent(target.split("#")[0]),
    );
    assert.ok(
      !relative(root, path).startsWith(".."),
      `Documentation link leaves project: ${document}`,
    );
    assert.ok(
      existsSync(path),
      `Broken documentation link: ${document} -> ${target}`,
    );
    links++;
  }
}
for (const file of [
  "docs/API.md",
  "docs/BACKEND.md",
  "docs/ACCEPTANCE.md",
  "docs/AUTOMATION.md",
  "docs/RFP_STATUS.md",
  ".github/workflows/verify.yml",
])
  assert.ok(existsSync(file), `Missing project guide: ${file}`);
console.log(
  `Documentation passed: ${documents.length} Markdown files and ${links} local links checked.`,
);
