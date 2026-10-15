// Facts the docs state that a manifest or the source also carries. A number
// written in prose rots silently, so each one stated here is held to its source.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { PROJECT_ROOT } from "./helpers.ts";

const read = (path: string): string => readFileSync(join(PROJECT_ROOT, path), "utf8");

const COMPAT_PAGES = ["README.md", "docs-site/docs/reference/index.md"];

describe("requirements and compatibility", () => {
  for (const page of COMPAT_PAGES) {
    test(`${page} states the Node engine and the mermaid range from package.json`, () => {
      const text = read(page);
      expect(text).toContain(`\`${pkg.engines.node}\``);
      expect(text).toContain(`\`${pkg.dependencies.mermaid}\``);
    });
  }

  test("the reference names every type the Langium parser reads", () => {
    const source = read("src/parse/stats.ts");
    const table = source.slice(source.indexOf("const LANGIUM_TYPES"), source.indexOf("export function detectKeyword"));
    const keywords = [...table.matchAll(/^\s+"?([\w-]+)"?: "\w+",$/gm)].map((m) => m[1] as string);
    expect(keywords.length).toBeGreaterThan(0);
    const page = read("docs-site/docs/reference/index.md");
    for (const keyword of keywords) expect(page).toContain(`\`${keyword}\``);
  });
});
