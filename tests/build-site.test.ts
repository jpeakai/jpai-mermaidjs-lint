// The site generator's own promises: every fixture folder is described, the
// report lines match the CLI's, and the landing snippet names a file the
// reader can see.

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { FIXTURE_GROUPS, failures, homeCompare, reportLines, undescribedFolders } from "../scripts/build-site.ts";
import { checkMarkdown } from "../src/index.ts";
import { fence, PROJECT_ROOT, runCli, tempProject } from "./helpers.ts";

const FIXTURES = join(PROJECT_ROOT, "tests", "fixtures");

describe("build-site", () => {
  test("every fixture folder has a description, and a new folder would fail the build", () => {
    const folders = readdirSync(FIXTURES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(undescribedFolders(folders)).toEqual([]);
    expect(undescribedFolders([...folders, "brand-new"])).toEqual(["brand-new"]);
    expect(FIXTURE_GROUPS.regressions).toBeDefined();
  });

  test("the npm homepage is the docs site", () => {
    expect(pkg.homepage).toBe("https://jpeakai.github.io/jpai-mermaidjs-lint/");
  });

  test("no description speaks of an undefined original skill", () => {
    for (const text of Object.values(FIXTURE_GROUPS)) expect(text).not.toContain("original skill");
  });

  test("report lines carry the line range exactly as the CLI prints them", async () => {
    const src = fence("flowchart LR\n  A -->");
    const root = tempProject({ "doc.md": src });
    const cli = await runCli(root, ["doc.md", "--profile", "github"]);
    const generated = reportLines(await checkMarkdown(src, join(root, "doc.md"), { profile: "github" }), "doc.md");
    expect(generated).toStartWith("doc.md:1-4 parse-diagram-unparseable");
    expect(cli.stdout.split("\n")[0]).toBe(generated);
  });

  test("the landing snippet names a neutral file at the line of its before diagram", async () => {
    const snippet = await homeCompare();
    expect(failures).toEqual([]);
    expect(snippet).toContain("docs/flow.md:4 contrast-text-below-aa");
    expect(snippet).not.toContain("contrast-text-fixable.md");
  });
});
