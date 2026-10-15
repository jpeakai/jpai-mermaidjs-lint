// The four tenets are written once, in docs-site/includes/tenets.md, which the
// docs site includes. The root markdown cannot include a file, so it repeats
// each line verbatim, and this test keeps the copies from drifting (MJL-0015).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./helpers.ts";

const read = (path: string): string => readFileSync(join(PROJECT_ROOT, path), "utf8");

const TENETS = read("docs-site/includes/tenets.md")
  .split("\n")
  .filter((line) => line.trim() !== "");

describe("the four tenets", () => {
  test("the canonical file holds four tenet lines", () => {
    expect(TENETS).toHaveLength(4);
    for (const line of TENETS) expect(line).toMatch(/^- \*\*[^*]+\.\*\* \S/);
  });

  for (const file of ["README.md", "CONTRIBUTING.md", "CLAUDE.md"]) {
    test(`${file} repeats every tenet verbatim`, () => {
      const lines = read(file).split("\n");
      for (const tenet of TENETS) expect(lines).toContain(tenet);
    });
  }
});
