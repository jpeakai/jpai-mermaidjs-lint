import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chain, fence, runCli, tempProject } from "./helpers.ts";

const BAD = fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n  class A c");

describe("cli", () => {
  test("a clean file exits 0 and reports the count", async () => {
    const root = tempProject({ "a.md": fence("flowchart LR\n  A --> B") });
    const r = await runCli(root, ["a.md"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 finding(s) in 1 file(s)");
  });

  test("a finding exits 1 with file, range, rule and message", async () => {
    const root = tempProject({ "a.md": BAD });
    const r = await runCli(root, ["a.md"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("a.md:4 contrast-text-below-aa classDef c: text 1.06:1 < 4.5");
  });

  test("a directory is walked, and a standalone .mmd is read", async () => {
    const root = tempProject({
      "docs/a.md": BAD,
      "docs/deep/b.mmd": "flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n",
    });
    const r = await runCli(root, ["docs"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("docs/a.md:4");
    expect(r.stdout).toContain("docs/deep/b.mmd:3");
    expect(r.stdout).toContain("2 finding(s) in 2 file(s)");
  });

  test("--json carries the remediation", async () => {
    const root = tempProject({ "a.md": BAD });
    const r = await runCli(root, ["a.md", "--json"]);
    const out = JSON.parse(r.stdout);
    expect(out.findings[0].rule).toBe("contrast-text-below-aa");
    expect(out.findings[0].remediation).toContain("4.5:1");
  });

  test("--fix rewrites the file and reports what remains", async () => {
    const root = tempProject({ "a.md": BAD });
    const r = await runCli(root, ["a.md", "--fix"]);
    expect(r.code).toBe(0);
    expect(readFileSync(join(root, "a.md"), "utf8")).toContain("color:#000000");
  });

  test("--preset changes the thresholds for the run", async () => {
    const root = tempProject({ "a.md": fence(chain(13)) });
    expect((await runCli(root, ["a.md"])).code).toBe(0);
    const r = await runCli(root, ["a.md", "--preset", "low"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("complexity-node-count-acceptable-exceeded");
  });

  test("--profile switches contrast reading", async () => {
    const root = tempProject({ "a.md": fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00\n  class A c") });
    expect((await runCli(root, ["a.md", "--profile", "mkdocs-material"])).code).toBe(1);
    expect((await runCli(root, ["a.md", "--profile", "github"])).stdout).toContain("contrast-directive-unauditable");
  });

  test("an ancestor mkdocs.yml selects the host profile automatically", async () => {
    const root = tempProject({
      "mkdocs.yml": "site_name: x\n",
      "docs/a.md": fence("flowchart LR\n  A --> B\n  classDef c fill:#1d4ed836,color:#fefefe\n  class A c"),
    });
    expect((await runCli(root, ["docs/a.md"])).code).toBe(0);
  });

  test("usage errors exit 2 with usage", async () => {
    const root = tempProject({});
    for (const args of [[], ["--nope"], ["--preset", "wild", "x.md"], ["--profile", "x", "x.md"], ["missing.md"]]) {
      const r = await runCli(root, args);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("usage:");
    }
    expect((await runCli(root, ["--no-plugins", "--lenient-plugins", "x.md"])).code).toBe(2);
    expect((await runCli(root, ["--validate-plugins", "x.md"])).code).toBe(2);
  });

  test("--help prints usage with the rules and exits 0", async () => {
    const r = await runCli(tempProject({}), ["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("contrast-text-below-aa*");
    expect(r.stdout).toContain("complexity-node-count-hard-limit ");
  });

  test("--list-rules groups by category", async () => {
    const r = await runCli(tempProject({}), ["--list-rules"]);
    expect(r.stdout).toContain("parse:");
    expect(r.stdout).toContain("  parse-fence-unterminated*");
  });
});

describe("cli additions", () => {
  test("--version prints the package version", async () => {
    const root = tempProject({});
    const r = await runCli(root, ["--version"]);
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { version: string };
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  test("--no-plugins sets aside a config setting for a plugin rule", async () => {
    const root = tempProject({
      "mermaidjs-lint.config.json": JSON.stringify({ rules: { "acme/house-left-to-right": "off" } }),
      "a.md": fence("flowchart LR\n  A --> B"),
    });
    const r = await runCli(root, ["a.md", "--no-plugins"]);
    expect(r.code).toBe(0);
  });

  test("--no-plugins still fails on an unknown built-in id", async () => {
    const root = tempProject({
      "mermaidjs-lint.config.json": JSON.stringify({ rules: { "contrast-no-such-rule": "off" } }),
      "a.md": fence("flowchart LR\n  A --> B"),
    });
    const r = await runCli(root, ["a.md", "--no-plugins"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown-rule");
  });
});
