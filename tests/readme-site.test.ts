// The docs site's home page mirrors README.md, so a reader who lands on either
// sees the same story in the same order. The README cannot include a file, so
// the text both pages share lives in docs-site/includes/, which the home page
// includes and the README repeats line for line. This test keeps the sections
// in step and the shared text from drifting.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./helpers.ts";

const read = (path: string): string => readFileSync(join(PROJECT_ROOT, path), "utf8");

const README = read("README.md");
const HOME = read("docs-site/docs/index.md");

const h2s = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());

// The includes the home page shares with the README.
const SHARED = ["intro.md", "sample-output.md", "fix-check.md", "tenets.md", "runs-on.md"];

describe("the home page mirrors the README", () => {
  test("the home page opens with the README's sections, in the same order", () => {
    const readme = h2s(README);
    expect(h2s(HOME).slice(0, readme.length)).toEqual(readme);
  });

  for (const name of SHARED) {
    test(`the home page includes ${name}`, () => {
      expect(HOME).toContain(`--8<-- "${name}"`);
    });

    test(`README.md repeats every line of ${name}`, () => {
      const lines = README.split("\n");
      for (const line of read(join("docs-site/includes", name)).split("\n")) {
        if (line.trim() !== "") expect(lines).toContain(line);
      }
    });
  }
});
