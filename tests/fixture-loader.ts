// Discovers the fixture corpus: every .md and .mmd file under tests/fixtures
// and examples. A fixture declares what the tool must report in a comment on
// any line of the file, so adding a case is adding one file and nothing else:
//
//   <!-- expect: contrast-text-below-aa contrast-border-below-ui-minimum -->   (.md)
//   %% expect: none                                                            (.mmd)
//
// A sibling named <name>.fixed.<ext> pins the exact output of --fix.

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
}

const isFixed = (name: string): boolean => /\.fixed\.[^.]+$/.test(name);

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
    else if ([".md", ".mmd"].includes(extname(entry.name)) && entry.name !== "README.md" && !isFixed(entry.name))
      out.push(abs);
  }
  return out;
};

export const loadFixtures = (): Fixture[] =>
  FIXTURE_ROOTS.flatMap(walk).map((path) => {
    const source = readFileSync(path, "utf8");
    const ext = extname(path);
    const pinned = join(dirname(path), `${basename(path, ext)}.fixed${ext}`);
    return {
      path,
      rel: relative(PROJECT_ROOT, path),
      source,
      expected: parseExpect(source),
      fixed: existsSync(pinned) ? readFileSync(pinned, "utf8") : null,
    };
  });
