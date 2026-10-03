// Checks the web app's translations. Run by `npm run lint`.
//
//   1. Every locale has the same keys as every other (plural forms such as
//      key_one / key_other count as the key itself).
//   2. Every literal key the code asks for — t("key"), t("ns:key"),
//      i18nKey="key" — exists, in the namespace(s) the file's
//      useTranslation(...) names.
//   3. No Vietnamese text is written straight into the code: string literals,
//      template literals and JSX text containing Vietnamese letters must come
//      from the locale files instead. Comments are not checked.
//
// A line that really needs a literal (a language name shown in its own
// language, say) can opt out with an `i18n-ignore` comment on that line or
// the line before.
//
// Usage: node scripts/check-i18n.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const espree = require("espree");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const WEB_SRC = path.join(ROOT, "apps/web/src");
const LOCALES = path.join(WEB_SRC, "locales");

// Letters that only occur in Vietnamese (not in English or plain ASCII).
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const problems = [];
const report = (file, line, message) =>
  problems.push(`${path.relative(ROOT, file).replace(/\\/g, "/")}${line ? `:${line}` : ""}  ${message}`);

// ------------------------------------------------------------- locale files
function flatten(object, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, full, out);
    else out.set(full, value);
  }
  return out;
}

const languages = fs.readdirSync(LOCALES).filter((name) => fs.statSync(path.join(LOCALES, name)).isDirectory());
const namespaces = new Set();
const keys = {}; // language -> namespace -> Set(base keys)

for (const language of languages) {
  keys[language] = {};
  for (const file of fs.readdirSync(path.join(LOCALES, language)).filter((f) => f.endsWith(".json"))) {
    const namespace = file.replace(/\.json$/, "");
    namespaces.add(namespace);
    const full = path.join(LOCALES, language, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (err) {
      report(full, 0, `invalid JSON: ${err.message}`);
      continue;
    }
    const flat = flatten(data);
    keys[language][namespace] = new Set([...flat.keys()].map((key) => key.replace(PLURAL_SUFFIX, "")));
    for (const [key, value] of flat) {
      if (typeof value !== "string") report(full, 0, `${key}: value must be text`);
      else if (!value.trim()) report(full, 0, `${key}: empty translation`);
    }
  }
}

for (const namespace of namespaces) {
  for (const language of languages) {
    const own = keys[language][namespace];
    if (!own) {
      report(path.join(LOCALES, language), 0, `missing ${namespace}.json`);
      continue;
    }
    for (const other of languages) {
      if (other === language || !keys[other][namespace]) continue;
      for (const key of keys[other][namespace]) {
        if (!own.has(key)) report(path.join(LOCALES, language, `${namespace}.json`), 0, `missing key "${key}" (present in ${other})`);
      }
    }
  }
}

const hasKey = (namespace, key) => languages.every((language) => keys[language][namespace]?.has(key));

// ------------------------------------------------------------- source files
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== LOCALES) out.push(...sourceFiles(full));
    } else if (/\.(jsx?|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const [field, value] of Object.entries(node)) {
    if (field === "parent") continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (value && typeof value === "object" && typeof value.type === "string") walk(value, visit, node);
  }
}

const stringOf = (node) =>
  node?.type === "Literal" && typeof node.value === "string"
    ? node.value
    : node?.type === "TemplateLiteral" && node.expressions.length === 0
      ? node.quasis[0].value.cooked
      : null;

for (const file of sourceFiles(WEB_SRC)) {
  const code = fs.readFileSync(file, "utf8");
  const lines = code.split(/\r?\n/);
  const ignored = (line) => /i18n-ignore/.test(lines[line - 1] || "") || /i18n-ignore/.test(lines[line - 2] || "");

  let ast;
  try {
    ast = espree.parse(code, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true });
  } catch (err) {
    report(file, err.lineNumber, `cannot parse: ${err.message}`);
    continue;
  }

  // Namespaces this file translates with: useTranslation("ns") or (["a", "b"]).
  const fileNamespaces = [];
  walk(ast, (node) => {
    if (node.type === "CallExpression" && node.callee.name === "useTranslation") {
      const arg = node.arguments[0];
      if (stringOf(arg)) fileNamespaces.push(stringOf(arg));
      if (arg?.type === "ArrayExpression") arg.elements.forEach((el) => stringOf(el) && fileNamespaces.push(stringOf(el)));
    }
  });
  const lookIn = fileNamespaces.length ? fileNamespaces : ["common"];

  const checkKey = (raw, line) => {
    if (ignored(line)) return;
    const [namespace, key] = raw.includes(":") ? raw.split(/:(.*)/s) : [null, raw];
    const candidates = namespace ? [namespace] : lookIn;
    if (!candidates.some((ns) => hasKey(ns, key))) {
      report(file, line, `translation key "${raw}" not found in ${candidates.join("/")} for every language`);
    }
  };

  walk(ast, (node, parent) => {
    const line = node.loc?.start.line;

    // t("key") / i18n.t("key")
    if (node.type === "CallExpression") {
      const callee = node.callee;
      const name = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" ? callee.property.name : null;
      const key = stringOf(node.arguments[0]);
      if (name === "t" && key) checkKey(key, line);
    }

    // <Trans i18nKey="key" />
    if (node.type === "JSXAttribute" && node.name.name === "i18nKey" && stringOf(node.value)) {
      checkKey(stringOf(node.value), line);
    }

    // Hard-coded Vietnamese.
    let text = null;
    if (node.type === "Literal" && typeof node.value === "string") text = node.value;
    else if (node.type === "TemplateElement") text = node.value.cooked;
    else if (node.type === "JSXText") text = node.value;
    if (text && VIETNAMESE.test(text) && !ignored(line)) {
      // Keys passed to t() are identifiers, never Vietnamese, so anything
      // here is text a reader sees.
      const isImport = parent?.type === "ImportDeclaration";
      if (!isImport) report(file, line, `hard-coded Vietnamese text: "${text.trim().slice(0, 60)}"`);
    }
  });
}

if (problems.length) {
  console.error(`i18n check: ${problems.length} problem(s)\n`);
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n check: ${languages.join(", ")} locales consistent; no missing keys or hard-coded Vietnamese.`);
