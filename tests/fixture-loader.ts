// Discovers the fixture corpus: every .md, .mmd and .mermaid file under tests/fixtures
// and examples, except README.md and the .fixed and .llm siblings. A fixture declares what the tool must report in a comment on
// any line of the file, so adding a case is adding one file, in a folder that
// scripts/build-site.ts describes in FIXTURE_GROUPS (tests/build-site.test.ts
// fails on a file outside one):
//
//   <!-- expect: contrast-text-below-aa contrast-border-below-ui-minimum -->   (.md)
//   %% expect: none                                                            (.mmd, .mermaid)
//
// A sibling named <name>.fixed.<ext> pins the exact output of --fix.
//
// A sibling named <name>.llm.<ext> is the judgement fix an LLM proposed for the
// findings --fix cannot clear, such as a split diagram or a new palette. It
// carries its reasoning in a comment, and it must lint clean:
//
//   <!-- llm: Split the chain into an overview and one diagram per stage. -->
//   %% llm: Declared a label colour that reads on the fill.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { PROJECT_ROOT } from "./helpers.ts";

export const FIXTURE_ROOTS = [join(PROJECT_ROOT, "tests", "fixtures"), join(PROJECT_ROOT, "examples")];

const EXPECT = /^(?:%%|<!--)\s*expect:\s*(.*?)\s*(?:-->)?\s*$/m;

export interface Fixture {
  // Absolute path.
  path: string;
  // Path relative to the project root, which names the case in test output.
  rel: string;
  source: string;
  // The rule ids the file must produce, sorted and distinct. Null when the file
  // declares nothing, which the suite reports as a failure.
  expected: string[] | null;
  // The pinned --fix output, when a .fixed sibling exists.
  fixed: string | null;
  // The LLM fix, when a .llm sibling exists.
  llm: { path: string; source: string; reason: string | null } | null;
}

const isSibling = (name: string): boolean => /\.(fixed|llm)\.[^.]+$/.test(name);

const LLM_REASON = /^(?:%%|<!--)\s*llm:\s*(.*?)\s*(?:-->)?\s*$/m;

const parseExpect = (source: string): string[] | null => {
  const m = EXPECT.exec(source);
  if (!m) return null;
  const tokens = (m[1] ?? "").split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 1 && tokens[0] === "none") return [];
  return [...new Set(tokens)].sort();
};

const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (
      [".md", ".mmd", ".mermaid"].includes(extname(entry.name)) &&
      entry.name !== "README.md" &&
      !isSibling(entry.name)
    )
      out.push(abs);
  }
  return out;
};

export const loadFixtures = (): Fixture[] =>
  FIXTURE_ROOTS.flatMap(walk).map((path) => {
    const source = readFileSync(path, "utf8");
    const ext = extname(path);
    const pinned = join(dirname(path), `${basename(path, ext)}.fixed${ext}`);
    const llmPath = join(dirname(path), `${basename(path, ext)}.llm${ext}`);
    const llmSource = existsSync(llmPath) ? readFileSync(llmPath, "utf8") : null;
    return {
      path,
      rel: relative(PROJECT_ROOT, path),
      source,
      expected: parseExpect(source),
      fixed: existsSync(pinned) ? readFileSync(pinned, "utf8") : null,
      llm:
        llmSource === null
          ? null
          : { path: llmPath, source: llmSource, reason: LLM_REASON.exec(llmSource)?.[1] ?? null },
    };
  });
