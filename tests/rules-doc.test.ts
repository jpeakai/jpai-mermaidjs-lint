// RULES.md is held to the code: every rule has a section and a row, and every
// before block fixes to exactly its after block, while a reported block is left
// untouched by the fixer and still has a finding.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMarkdown, fixSource, RULES } from "../src/index.ts";
import { PROJECT_ROOT } from "./helpers.ts";

const doc = readFileSync(join(PROJECT_ROOT, "RULES.md"), "utf8");

const blocks = (label: string): string[] =>
  [...doc.matchAll(new RegExp(`\`\`\`\`text ${label}\\n([\\s\\S]*?)\\n\`\`\`\``, "g"))].map((m) => `${m[1]}\n`);

describe("RULES.md", () => {
  test("has a section for every rule and no other", () => {
    const headings = [...doc.matchAll(/^### (\S+)$/gm)].map((m) => m[1]);
    expect(headings.sort()).toEqual(RULES.map((r) => r.id).sort());
  });

  test("lists every rule in the categories table", () => {
    const table = doc.slice(doc.indexOf("## Categories"), doc.indexOf("## Parse"));
    for (const rule of RULES) expect(table).toContain(rule.id);
  });

  test("every before block fixes to its after block", async () => {
    const before = blocks("before");
    const after = blocks("after");
    expect(before.length).toBe(after.length);
    expect(before.length).toBeGreaterThan(0);
    for (const [i, src] of before.entries()) expect(await fixSource(src, "doc.md")).toBe(after[i] as string);
  });

  test("every reported block is followed by an LLM fix that says why and lints clean", async () => {
    const reported = blocks("reported");
    const llm = blocks("llm");
    expect(llm.length).toBe(reported.length);
    for (const src of llm) {
      expect(src).toMatch(/<!--\s*llm:\s*\S/);
      expect(await checkMarkdown(src, "doc.md")).toEqual([]);
    }
  });

  test("every reported block keeps a finding and is left untouched", async () => {
    const reported = blocks("reported");
    expect(reported.length).toBeGreaterThan(0);
    for (const src of reported) {
      expect((await checkMarkdown(src, "doc.md")).length).toBeGreaterThan(0);
      expect(await fixSource(src, "doc.md")).toBe(src);
    }
  });
});
