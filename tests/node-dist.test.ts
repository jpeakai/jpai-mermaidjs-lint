// The published CLI under Node: dist/bin.js is what `npx mermaidjs-lint` runs,
// so these tests spawn `node` on it, not Bun on the source. Every make target
// that runs the tests builds dist first (`test: build`, `test-cov-ts: build`).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { fence, PROJECT_ROOT, runCli, tempProject } from "./helpers.ts";

const BIN = join(PROJECT_ROOT, "dist", "bin.js");
const NODE = ["node", BIN];

const BAD = fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n  class A c");

describe("node dist/bin.js", () => {
  test("dist is built", () => {
    expect(existsSync(BIN), "dist/bin.js is missing; run make build").toBe(true);
  });

  test("--version prints the package version", async () => {
    const r = await runCli(tempProject({}), ["--version"], NODE);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  test("a clean file exits 0", async () => {
    const r = await runCli(tempProject({ "a.md": fence("flowchart LR\n  A --> B") }), ["a.md"], NODE);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 finding(s) in 1 file(s)");
  });

  test("a failing file exits 1 with the finding", async () => {
    const r = await runCli(tempProject({ "a.md": BAD }), ["a.md"], NODE);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("a.md:4 contrast-text-below-aa");
  });

  test("--fix rewrites the file and exits 0", async () => {
    const root = tempProject({ "a.md": BAD });
    const r = await runCli(root, ["a.md", "--fix"], NODE);
    expect(r.code).toBe(0);
    expect(readFileSync(join(root, "a.md"), "utf8")).toContain("color:#000000");
  });

  test("a usage error exits 2", async () => {
    const r = await runCli(tempProject({}), ["missing.md"], NODE);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[flag]");
  });
});
