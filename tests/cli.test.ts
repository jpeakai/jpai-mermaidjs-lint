import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { chain, fence, runCli, tempProject } from "./helpers.ts";

const BAD = fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n  class A c");

describe("cli checking", () => {
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
});

describe("cli flags", () => {
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
});

describe("cli help and rule list", () => {
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

  test("--list-rules honours --config and refuses a flag or path it would ignore", async () => {
    const root = tempProject({
      "off.json": JSON.stringify({ rules: { "parse-fence-unterminated": "off" } }),
      "a.md": fence("flowchart LR\n  A --> B"),
    });
    const listed = await runCli(root, ["--list-rules", "--config", "off.json", "--no-plugins"]);
    expect(listed.code).toBe(0);
    expect(listed.stdout).not.toContain("parse-fence-unterminated");
    for (const extra of [
      ["--json"],
      ["--fix"],
      ["--preset", "high"],
      ["--profile", "github"],
      ["--canvas-dark", "#000000"],
      ["a.md"],
    ]) {
      const r = await runCli(root, ["--list-rules", ...extra]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("error[flag]: --list-rules takes only --config and --no-plugins or --lenient-plugins");
    }
  });
});

// A config that leaves a marker file when it is imported, so a test can see
// whether the code ran.
const MARKING_CONFIG = [
  'import { writeFileSync } from "node:fs";',
  'writeFileSync(new URL("./ran.txt", import.meta.url), "ran");',
  "export default {};",
].join("\n");

describe("cli additions: files, version and usage", () => {
  test("--version prints the package version", async () => {
    const root = tempProject({});
    const r = await runCli(root, ["--version"]);
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { version: string };
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  test("an explicit .mermaid file is read as a raw diagram, and a directory walk finds it", async () => {
    const broken = "flowchart LR\n  A -->\n";
    const root = tempProject({ "d.mermaid": broken, "docs/e.mermaid": broken, "notes.txt": broken });
    const r = await runCli(root, ["d.mermaid", "docs", "notes.txt"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("d.mermaid:1-3 parse-diagram-unparseable");
    expect(r.stdout).toContain("docs/e.mermaid:1-3 parse-diagram-unparseable");
    // Any other extension is read as markdown, and holds no mermaid fence here.
    expect(r.stdout).not.toContain("notes.txt");
    expect(r.stdout).toContain("2 finding(s) in 3 file(s)");
  });

  test("a usage error prints the error and the usage lines, not the whole help", async () => {
    const r = await runCli(tempProject({}), ["missing.md"]);
    expect(r.code).toBe(2);
    const lines = r.stderr.trim().split("\n");
    expect(lines[0]).toStartWith("error[flag]: cannot read ");
    expect(lines[0]).toEndWith("missing.md");
    expect(lines[1]).toStartWith("usage: mermaidjs-lint");
    expect(lines.at(-1)).toBe("run mermaidjs-lint --help for more");
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(r.stderr).not.toContain("Deterministic Mermaid diagram gates");
  });
});

describe("cli additions: --no-plugins and config rules", () => {
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

describe("cli additions: --no-plugins and a .mjs config", () => {
  test("--no-plugins refuses to import a .mjs config, and the config does not run", async () => {
    const root = tempProject({ "mermaidjs-lint.config.mjs": MARKING_CONFIG, "a.md": fence("flowchart LR\n  A --> B") });
    const r = await runCli(root, ["a.md", "--no-plugins"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[config-code]");
    expect(r.stderr).toContain("pass --config with a .json config");
    expect(existsSync(join(root, "ran.txt"))).toBe(false);
  });

  test("--no-plugins refuses a .mjs config named with --config too", async () => {
    const root = tempProject({ "own.mjs": MARKING_CONFIG, "a.md": fence("flowchart LR\n  A --> B") });
    const r = await runCli(root, ["a.md", "--no-plugins", "--config", "own.mjs"]);
    expect(r.code).toBe(2);
    expect(existsSync(join(root, "ran.txt"))).toBe(false);
  });

  test("--no-plugins with --config <json> lints a repo whose own config is .mjs, without running it", async () => {
    const root = tempProject({
      "mermaidjs-lint.config.mjs": MARKING_CONFIG,
      "own.json": JSON.stringify({ rules: { "contrast-text-below-aa": "off" } }),
      "a.md": BAD,
    });
    const r = await runCli(root, ["a.md", "--no-plugins", "--config", "own.json"]);
    expect(r.stdout).not.toContain("contrast-text-below-aa");
    expect(existsSync(join(root, "ran.txt"))).toBe(false);
  });

  test("without --no-plugins a .mjs config is imported as before", async () => {
    const root = tempProject({ "mermaidjs-lint.config.mjs": MARKING_CONFIG, "a.md": fence("flowchart LR\n  A --> B") });
    expect((await runCli(root, ["a.md"])).code).toBe(0);
    expect(existsSync(join(root, "ran.txt"))).toBe(true);
  });
});

describe("cli additions: precedence", () => {
  test("--help states precedence, the --no-plugins config rule, the path rule and lenient exits", async () => {
    const { stdout } = await runCli(tempProject({}), ["--help"]);
    expect(stdout).toContain("It overrides a preset set in the config");
    expect(stdout).toContain("numeric threshold set in the config overrides both");
    expect(stdout).toContain("It overrides a profile set in the config");
    expect(stdout).toContain("stops with a usage error rather than import a .mjs config");
    expect(stdout).not.toContain("do not trust");
    expect(stdout).toContain(".mmd or .mermaid is read as one raw diagram");
    expect(stdout).toContain("any other file is read as markdown");
    expect(stdout).toContain("a lenient run\nskips a broken plugin");
  });

  test("--preset overrides a configured preset, and a configured threshold overrides both", async () => {
    const root = tempProject({
      "mermaidjs-lint.config.json": JSON.stringify({
        rules: { "complexity-node-count-acceptable-exceeded": ["error", { preset: "high" }] },
      }),
      "a.md": fence(chain(16)),
    });
    // 16 nodes: clean under high, over low's acceptable 12.
    expect((await runCli(root, ["a.md"])).code).toBe(0);
    expect((await runCli(root, ["a.md", "--preset", "low"])).stdout).toContain("16 nodes > 12");
    const pinned = tempProject({
      "mermaidjs-lint.config.json": JSON.stringify({
        rules: { "complexity-node-count-acceptable-exceeded": ["error", { nodeAcceptable: 30 }] },
      }),
      "a.md": fence(chain(16)),
    });
    expect((await runCli(pinned, ["a.md", "--preset", "low"])).stdout).not.toContain(
      "complexity-node-count-acceptable-exceeded",
    );
  });
});

describe("what a rule sees as ctx.file", () => {
  // A local rule that reports the path its check saw, and whose fixer writes
  // the path it saw to a file beside the project, so both can be compared.
  const RULE = `import { writeFileSync } from "node:fs";
export default {
  category: "diagram",
  summary: "records ctx.file",
  check: ({ file }) => [{ line: 1, message: "check saw " + file }],
  fix: ({ file }) => { writeFileSync(new URL("../../fix-saw.txt", import.meta.url), file); return []; },
};
export const categories = { diagram: "d" };`;

  test("is the same absolute path in check and in fix, while the report stays relative", async () => {
    const root = tempProject({
      "docs/a.md": fence("flowchart LR\n  A --> B"),
      ".mermaidjs-lint/rules/diagram-path.mjs": RULE,
    });
    const r = await runCli(root, ["--fix", "docs/"]);
    const fixSaw = readFileSync(join(root, "fix-saw.txt"), "utf8");
    expect(fixSaw).toBe(join(root, "docs", "a.md"));
    expect(r.stdout).toContain(`docs/a.md:1 local/diagram-path check saw ${fixSaw}`);
  });
});

describe("symbolic links", () => {
  const linked = (): string => {
    const root = tempProject({ "docs/real.md": BAD, "outside/target.md": BAD, "outside/inner/deep.md": BAD });
    symlinkSync(join(root, "outside", "target.md"), join(root, "docs", "link.md"));
    symlinkSync(join(root, "outside"), join(root, "docs", "linkdir"));
    return root;
  };

  test("a directory walk skips each link and names it", async () => {
    const root = linked();
    const r = await runCli(root, ["docs/"]);
    expect(r.stdout).toContain("1 finding(s) in 1 file(s)");
    expect(r.stderr).toContain("skipped symbolic link docs/link.md");
    expect(r.stderr).toContain("skipped symbolic link docs/linkdir");
  });

  test("a link named as a path is read", async () => {
    const r = await runCli(linked(), ["docs/link.md"]);
    expect(r.stdout).toContain("docs/link.md:4 contrast-text-below-aa");
  });

  test("--fix refuses to write through a link whose target is outside the project root", async () => {
    const outer = tempProject({ "target.md": BAD });
    const root = tempProject({ "docs/real.md": BAD });
    symlinkSync(join(outer, "target.md"), join(root, "docs", "link.md"));
    const r = await runCli(root, ["--fix", "docs/link.md", "docs/real.md"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[fix-outside-root]: docs/link.md is a symbolic link to");
    // Nothing is written, not even the file that is not a link.
    expect(readFileSync(join(outer, "target.md"), "utf8")).toBe(BAD);
    expect(readFileSync(join(root, "docs", "real.md"), "utf8")).toBe(BAD);
    // The message's advice works: the target named as its own path is fixed.
    expect(r.stderr).toContain("or run on the target path itself");
    const direct = await runCli(root, ["--fix", join(outer, "target.md")]);
    expect(direct.code).toBe(0);
    expect(readFileSync(join(outer, "target.md"), "utf8")).toContain("color:#000000");
  });

  test("--fix writes through a link whose target is inside the project root", async () => {
    const root = tempProject({ "docs/real.md": BAD, "shared/target.md": BAD });
    symlinkSync(join(root, "shared", "target.md"), join(root, "docs", "link.md"));
    const r = await runCli(root, ["--fix", "docs/link.md"]);
    expect(r.code).toBe(0);
    expect(readFileSync(join(root, "shared", "target.md"), "utf8")).toContain("color:#000000");
  });
});

describe("help layout", () => {
  test("every rule summary starts in one column, autofixable or not", async () => {
    const { stdout } = await runCli(tempProject({}), ["--help"]);
    const rows = stdout.split("\n").filter((l) => /^ {4}[a-z]+-[a-z-]+\*? +\S/.test(l));
    expect(rows.length).toBeGreaterThan(5);
    const column = (l: string): number => (/^ {4}\S+ +/.exec(l) as RegExpExecArray)[0].length;
    expect(new Set(rows.map(column)).size).toBe(1);
    expect(stdout).toContain("1 when findings remain, a plugin fails to load or the run fails");
    expect(stdout).toContain("and from the config's plugins list");
  });
});

describe("--split-plan", () => {
  test("prints the overview and every detail as mermaid fences, and writes no file", async () => {
    const root = tempProject({ "a.md": fence(chain(60)) });
    const r = await runCli(root, ["a.md", "--split-plan"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("complexity-node-count-cognitive-limit");
    expect(r.stdout).toMatch(/\n## a\.md:1: split plan \(T[2-6]\)\n\n### Overview\n\n```mermaid\nflowchart LR\n/);
    const details = r.stdout.match(/^### Detail g\d+: /gm) ?? [];
    expect(details.length).toBeGreaterThan(0);
    expect(r.stdout.match(/^```mermaid$/gm)?.length).toBe(details.length + 1);
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe(fence(chain(60)));
  });

  // The printed plan is markdown, so the linter itself reads it back: every
  // fence parses, and the overview and each detail are within the target.
  test("every printed diagram parses and passes the complexity rules", async () => {
    const root = tempProject({ "a.md": fence(chain(60)) });
    const printed = (await runCli(root, ["a.md", "--split-plan"])).stdout;
    const plan = tempProject({ "plan.md": printed.slice(printed.indexOf("\n## ")) });
    const r = await runCli(plan, ["plan.md", "--category", "parse,complexity", "--disable-category", "contrast"]);
    expect(r.stdout).toContain("0 finding(s) in 1 file(s)");
  });

  test("a diagram with no plan says why", async () => {
    const loose = Array.from({ length: 51 }, (_, i) => `  n${i}`).join("\n");
    const root = tempProject({ "a.md": fence(`flowchart LR\n${loose}`) });
    const r = await runCli(root, ["a.md", "--split-plan"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("\n## a.md:1: no split plan\n\nNo tier reaches the target");
    expect(r.stdout).not.toContain("```mermaid");
  });

  test("a clean file prints no plan and exits 0", async () => {
    const r = await runCli(tempProject({ "a.md": fence(chain(5)) }), ["a.md", "--split-plan"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("0 finding(s) in 1 file(s)\n");
  });

  test.each([["--fix"], ["--json"], ["--list-rules"], ["--validate-plugins"]])(
    "refuses %s with a usage error",
    async (flag) => {
      const args = flag === "--fix" || flag === "--json" ? ["a.md", flag, "--split-plan"] : [flag, "--split-plan"];
      const r = await runCli(tempProject({ "a.md": fence(chain(60)) }), args);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(
        `error[flag]: --split-plan prints plans after a check's text report, so it takes no ${flag}`,
      );
    },
  );
});

describe("--split-plan over a detail split once more", () => {
  // A detail over the target is printed only as its own split, never whole,
  // so every fence printed still meets the target at the same preset. The two
  // regions are of one size, so neither holds most of the diagram (MJL-0034).
  test("a detail split once more is printed as its split, and the printout lints clean", async () => {
    const work = Array.from({ length: 24 }, (_, i) => `    w${i} --> w${i + 1}`);
    const other = Array.from({ length: 24 }, (_, i) => `    v${i} --> v${i + 1}`);
    const source = [
      "flowchart LR",
      ...["  subgraph W[Work]", ...work, "  end", "  subgraph V[Other]", ...other, "  end"],
      ...["  a --> w0", "  w24 --> v0", "  v24 --> b"],
    ].join("\n");
    for (const preset of ["low-density", "medium-density", "high-density"]) {
      const root = tempProject({ "a.md": fence(source) });
      const printed = (await runCli(root, ["a.md", "--split-plan", "--preset", preset])).stdout;
      expect(printed).toContain("is over the target, so it is split once more");
      expect(printed).toMatch(/### Detail (g\d+): [^\n]*\n\nDetail \1 is over the target/);
      const plan = tempProject({ "plan.md": printed.slice(printed.indexOf("\n## ")) });
      const r = await runCli(plan, ["plan.md", "--preset", preset, "--category", "parse,complexity"]);
      expect(r.stdout).toContain("0 finding(s) in 1 file(s)");
    }
    // Six CLI runs, two per preset, outlast the default 5s on a CI runner.
  }, 60_000);
});
