#!/usr/bin/env bun
// Generates the reference pages of the docs site from the sources the test
// suite already runs: RULES.md, the fixture corpus and examples/. Every example
// is checked again as its page is written, and any drift fails the build, so the
// site can never show behaviour the tool no longer has.
//
//   bun run scripts/build-site.ts      writes docs-site/docs/reference/

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { buildDocModel, CATEGORIES, checkMarkdown, type Finding, fixSource, RULES } from "../src/index.ts";
import { type Fixture, loadFixtures } from "../tests/fixture-loader.ts";
import { PROJECT_ROOT } from "../tests/helpers.ts";

const SITE_DOCS = join(PROJECT_ROOT, "docs-site", "docs");
const OUT = join(SITE_DOCS, "reference");
const RULES_PATH = join(PROJECT_ROOT, "RULES.md");
// Every example in RULES.md is scored as a GitHub README would be.
const DOC_FILE = join(PROJECT_ROOT, "doc.md");

const failures: string[] = [];
const fail = (where: string, what: string): void => {
  failures.push(`${where}: ${what}`);
};

// ── Markdown helpers ────────────────────────────────────────────────────

// A fence one backtick longer than any run inside the text, so nesting is safe.
const fenced = (text: string, lang: string): string => {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const tick = "`".repeat(longest + 1);
  return `${tick}${lang}\n${text.replace(/\n+$/, "")}\n${tick}`;
};

const indent = (text: string): string =>
  text
    .split("\n")
    .map((l) => (l ? `    ${l}` : l))
    .join("\n");

const tab = (title: string, body: string): string => `=== "${title}"\n\n${indent(body)}\n`;

const collapsible = (kind: string, title: string, body: string, open = false): string =>
  `${open ? "???+" : "???"} ${kind} "${title}"\n\n${indent(body)}\n`;

const cell = (s: string): string => s.replaceAll("|", "\\|").replaceAll("\n", " ");

const findingsTable = (findings: Finding[]): string =>
  findings.length === 0
    ? "No findings."
    : [
        "| Line | Rule | Message |",
        "|---:|---|---|",
        ...findings.map((f) => `| ${f.line} | \`${f.rule}\` | ${cell(f.message)} |`),
      ].join("\n");

const distinct = (findings: Finding[]): string[] => [...new Set(findings.map((f) => f.rule))].sort();

// A diagram mermaid cannot read would draw an error box, so it is shown as
// source only.
const renderable = (findings: Finding[]): boolean => !findings.some((f) => f.rule.startsWith("parse-"));

const mermaid = (source: string): string => fenced(source, "mermaid");

// ── Rules page ──────────────────────────────────────────────────────────

const ruleSection = (doc: string, id: string): string => {
  const start = doc.indexOf(`\n### ${id}\n`);
  if (start < 0) return "";
  const rest = doc.slice(start + 1);
  const next = rest.slice(1).search(/\n#{2,3} /);
  return next < 0 ? rest : rest.slice(0, next + 1);
};

const BLOCK = /````text (before|after|reported)\n([\s\S]*?)\n````/g;

const exampleTabs = async (id: string, label: string, src: string, after: string | null): Promise<string> => {
  const findings = await checkMarkdown(src, DOC_FILE);
  if (findings.length === 0) fail(`RULES.md ${id}`, `the ${label} example reports nothing`);
  const diagram = buildDocModel(src).diagrams[0];
  const parts: string[] = [];
  if (diagram && renderable(findings))
    parts.push(tab(label === "reported" ? "Reported" : "Before", mermaid(diagram.source)));
  parts.push(tab("Source", fenced(src, "markdown")));
  parts.push(tab("Findings", findingsTable(findings)));
  const fixed = await fixSource(src, DOC_FILE);
  if (after === null) {
    if (fixed !== src) fail(`RULES.md ${id}`, "a reported example is changed by --fix");
  } else {
    if (fixed !== after) fail(`RULES.md ${id}`, "--fix no longer produces the after example");
    const afterDiagram = buildDocModel(after).diagrams[0];
    if (afterDiagram) parts.push(tab("After --fix", mermaid(afterDiagram.source)));
    parts.push(tab("After source", fenced(after, "markdown")));
  }
  return parts.join("\n");
};

const rulesPage = async (): Promise<string> => {
  const doc = readFileSync(RULES_PATH, "utf8");
  const out: string[] = [
    "# Rules",
    "",
    "Every rule the tool ships, with each example from `RULES.md` drawn, checked and fixed live.",
    "The page is generated: a build fails when an example stops reporting its rule, or when `--fix` stops producing its after.",
    "",
  ];
  for (const category of CATEGORIES) {
    out.push(`## ${category[0]?.toUpperCase()}${category.slice(1)}`, "");
    for (const rule of RULES.filter((r) => r.category === category)) {
      const section = ruleSection(doc, rule.id);
      if (!section) fail("RULES.md", `no section for ${rule.id}`);
      out.push(`### ${rule.id}`, "", `**Fixer:** ${rule.fix ? "yes" : "no"}`, "");
      const options = Object.entries(rule.options ?? {});
      if (options.length) out.push(`**Options:** ${options.map(([k, t]) => `\`${k}\` (${t})`).join(", ")}`, "");
      const prose = section
        .replace(/^### .*\n/, "")
        .replace(BLOCK, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (prose) out.push(prose, "");
      const blocks = [...section.matchAll(BLOCK)].map((m) => ({ kind: m[1] as string, src: `${m[2]}\n` }));
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block || block.kind === "after") continue;
        const next = blocks[i + 1];
        const after = block.kind === "before" && next?.kind === "after" ? next.src : null;
        if (block.kind === "before" && after === null) fail(`RULES.md ${rule.id}`, "a before example has no after");
        out.push(await exampleTabs(rule.id, block.kind, block.src, after), "");
      }
    }
  }
  return out.join("\n");
};

// ── Fixtures page ───────────────────────────────────────────────────────

// Small fixtures get every diagram drawn; the large scenario files show their
// findings and source only, or the page would carry hundreds of diagrams.
const DRAW_LIMIT = 3;

const fixtureSection = async (f: Fixture): Promise<string> => {
  const findings = await checkMarkdown(f.source, f.path);
  const got = distinct(findings);
  if (f.expected === null) fail(f.rel, "has no expect comment");
  else if (got.join(" ") !== f.expected.join(" "))
    fail(f.rel, `expects ${f.expected.join(" ")} but reports ${got.join(" ")}`);
  const fixed = await fixSource(f.source, f.path);
  if (f.fixed !== null && fixed !== f.fixed) fail(f.rel, "--fix no longer matches its pinned .fixed file");

  const out: string[] = [
    `### ${basename(f.rel)}`,
    "",
    `\`${f.rel}\` expects ${got.length ? got.map((r) => `\`${r}\``).join(", ") : "no findings"}.`,
    "",
  ];
  const kind = f.path.endsWith(".mmd") ? "diagram" : "markdown";
  const before = buildDocModel(f.source, kind).diagrams;
  const after = buildDocModel(fixed, kind).diagrams;
  if (before.length > 0 && before.length <= DRAW_LIMIT) {
    for (const [i, d] of before.entries()) {
      const own = findings.filter((x) => x.line >= d.startLine && x.line <= d.endLine);
      if (!renderable(own)) continue;
      const tabs = [tab(own.length ? "Before" : "Diagram", mermaid(d.source))];
      const a = after[i];
      if (a && a.source !== d.source) tabs.push(tab("After --fix", mermaid(a.source)));
      out.push(tabs.join("\n"), "");
    }
  }
  out.push(findingsTable(findings), "");
  out.push(collapsible("note", "Source", fenced(f.source, kind === "diagram" ? "text" : "markdown")), "");
  if (fixed !== f.source)
    out.push(collapsible("success", "After --fix", fenced(fixed, kind === "diagram" ? "text" : "markdown")), "");
  return out.join("\n");
};

const fixturesPage = async (): Promise<string> => {
  const fixtures = loadFixtures().filter((f) => f.rel.startsWith("tests/"));
  const out: string[] = [
    "# Fixtures",
    "",
    "The fixture corpus under `tests/fixtures`, as the test suite runs it.",
    "Each file declares the rules it must report, and a `.fixed` sibling pins its `--fix` output.",
    "This page is generated from the same files, and the build fails when any of them drifts.",
    "",
  ];
  const folders = [...new Set(fixtures.map((f) => dirname(f.rel)))];
  for (const folder of folders) {
    out.push(`## ${basename(folder)}`, "");
    for (const f of fixtures.filter((x) => dirname(x.rel) === folder)) out.push(await fixtureSection(f));
  }
  return out.join("\n");
};

// ── Examples page ───────────────────────────────────────────────────────

const examplesPage = async (): Promise<string> => {
  const out: string[] = [
    "# Examples",
    "",
    "The layout, look and icon examples in `examples/`, each drawn by the mermaid CLI and linted clean.",
    "They use layouts and icon packs a host may not load, so each is shown as a rendered image beside its source.",
    "",
  ];
  for (const f of loadFixtures().filter((x) => x.rel.startsWith("examples/"))) {
    const name = basename(f.path, ".mmd");
    const findings = await checkMarkdown(f.source, f.path);
    if (findings.length) fail(f.rel, `an example must lint clean, but reports ${distinct(findings).join(" ")}`);
    const png = join(SITE_DOCS, "assets", "examples", `${name}.png`);
    if (!existsSync(png)) fail(f.rel, `has no rendered image at ${png}`);
    out.push(
      `## ${name}`,
      "",
      tab("Rendered", `![${name}](../assets/examples/${name}.png)`),
      tab("Source", fenced(f.source, "text")),
    );
  }
  return out.join("\n");
};

// ── Main ────────────────────────────────────────────────────────────────

const HELP = [
  "Usage: bun run scripts/build-site.ts",
  "",
  "Write the generated reference pages of the docs site to docs-site/docs/reference,",
  "checking every example against the tool. Exits 1 when any example has drifted.",
  "",
  "Options:",
  "  -h, --help  Show this help and exit",
].join("\n");

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { help: { type: "boolean", short: "h", default: false } },
    strict: true,
  });
  if (values.help) {
    console.log(HELP);
    return;
  }

  const pages = {
    "rules.md": await rulesPage(),
    "fixtures.md": await fixturesPage(),
    "examples.md": await examplesPage(),
  };
  if (failures.length) {
    console.error(`build-site: ${failures.length} example(s) drifted from the tool:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const [name, body] of Object.entries(pages)) {
    writeFileSync(join(OUT, name), `<!-- Generated by scripts/build-site.ts. Do not edit. -->\n\n${body}\n`);
  }
  console.log(`build-site: wrote ${Object.keys(pages).length} pages to docs-site/docs/reference`);
};

main().catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
