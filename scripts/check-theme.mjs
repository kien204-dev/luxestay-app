// Fails when a colour is written straight into the web app's code instead of
// coming from the theme (the CSS variables in apps/web/src/index.css).
// Run by `npm run lint`.
//
// Third-party brand colours (Google's logo, MoMo's pink) are allowed on a
// line marked `theme-ignore` (or the line before it). Stylesheets are not
// checked: that is where the theme's own colours are defined.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = path.join(ROOT, "apps/web/src");
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;
// Files that compute colours from the theme rather than hard-coding them.
const EXEMPT = new Set(["utils/imageUrl.js", "utils/themeColors.js"].map((file) => path.join(SRC, file)));

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "locales" ? [] : files(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const problems = [];
for (const file of files(SRC)) {
  if (EXEMPT.has(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let inBlockComment = false;
  lines.forEach((line, index) => {
    let code = line;
    if (inBlockComment) {
      if (!code.includes("*/")) return;
      code = code.slice(code.indexOf("*/") + 2);
      inBlockComment = false;
    }
    code = code.replace(/\/\*.*?\*\//g, "");
    if (code.includes("/*")) {
      inBlockComment = true;
      code = code.slice(0, code.indexOf("/*"));
    }
    code = code.replace(/(^|[^:])\/\/.*$/, "$1");
    if (!COLOUR.test(code)) return;
    if (/theme-ignore/.test(line) || /theme-ignore/.test(lines[index - 1] || "")) return;
    problems.push(`${path.relative(ROOT, file).replace(/\\/g, "/")}:${index + 1}  hard-coded colour: ${code.trim().slice(0, 80)}`);
  });
}

if (problems.length) {
  console.error(`theme check: ${problems.length} hard-coded colour(s); use the theme variables (index.css)\n`);
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("theme check: no hard-coded colours in the web app's code.");
