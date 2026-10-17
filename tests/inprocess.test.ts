// The CLI and config paths, called in this process so coverage sees them. Output
// is captured by swapping console.log and console.error for the one call.

import { afterEach, describe, expect, test } from "bun:test";
import { optionsFor } from "../src/check.ts";
import { describeError, main } from "../src/cli.ts";
import {
  ConfigFileError,
  checkMarkdown,
  FlagError,
  fixSourceReport,
  loadConfig,
  MermaidLintError,
  parseConfig,
} from "../src/index.ts";
import { chain, fence, tempProject } from "./helpers.ts";

const realLog = console.log;
const realError = console.error;
afterEach(() => {
  console.log = realLog;
  console.error = realError;
});

const run = async (cwd: string, args: string[]): Promise<{ code: number; out: string; err: string }> => {
  const out: string[] = [];
  const err: string[] = [];
  console.log = (...a: unknown[]) => {
    out.push(a.join(" "));
  };
  console.error = (...a: unknown[]) => {
    err.push(a.join(" "));
  };
  try {
    return { code: await main(args, cwd), out: out.join("\n"), err: err.join("\n") };
  } finally {
    console.log = realLog;
    console.error = realError;
  }
};

const DOC = fence("flowchart LR\n  A --> B");

describe("main", () => {
  test("check, json, list and help paths", async () => {
    const root = tempProject({ "a.md": DOC });
    expect((await run(root, ["a.md"])).out).toContain("0 finding(s)");
    expect(JSON.parse((await run(root, ["a.md", "--json"])).out).files).toBe(1);
    expect((await run(root, ["--list-rules"])).out).toContain("complexity:");
    expect((await run(root, ["-h"])).out).toContain("usage:");
  });

  test("--fix and --preset flow through", async () => {
    const root = tempProject({ "a.md": fence(`${chain(13)}\n  classDef c fill:#ffff00,color:#fefefe`) });
    const r = await run(root, ["a.md", "--fix", "--preset", "low"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("complexity-node-count-acceptable-exceeded");
    expect(r.out).not.toContain("contrast-text-below-aa");
  });

  test("usage errors are described with their code", async () => {
    const root = tempProject({});
    const r = await run(root, ["--preset", "wild", "a.md"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("error[flag]");
    expect(describeError(new Error("x"))).toBe("error: x");
  });

  test("a library run rejects a bad preset or profile with FlagError", async () => {
    const preset = checkMarkdown(DOC, "a.md", { preset: "bogus" });
    await expect(preset).rejects.toBeInstanceOf(FlagError);
    await expect(preset).rejects.toMatchObject({ code: "flag", flag: "preset" });
    const profile = fixSourceReport(DOC, "a.md", { profile: "print" });
    await expect(profile).rejects.toMatchObject({ code: "flag", flag: "profile" });
    expect(await checkMarkdown(DOC, "a.md", { preset: "HIGH", profile: "github" })).toEqual([]);
  });

  test("validation reports plugins as json", async () => {
    const root = tempProject({ ".mermaidjs-lint/rules/diagram-bad.mjs": "export default 1" });
    const r = await run(root, ["--validate-plugins", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).failures).toHaveLength(1);
  });

  test("a loaded plugin is listed with where it came from", async () => {
    const root = tempProject({
      ".mermaidjs-lint/rules/diagram-ok.mjs": `export default { category: "diagram", summary: "s", check: () => [] };
export const categories = { diagram: "House" };`,
    });
    expect((await run(root, ["--list-rules"])).out).toContain("local (local)");
    expect((await run(root, ["--validate-plugins"])).out).toContain("plugins valid: local (1 rule)");
  });
});

const withConfig = (config: unknown): string =>
  tempProject({ "a.md": DOC, "mermaidjs-lint.config.json": JSON.stringify(config) });

// Each config mistake and the usage error code it is named by.
const CONFIG_MISTAKES: Array<[unknown, string]> = [
  [{ rules: { "no-such-rule": "off" } }, "unknown-rule"],
  [{ rules: { "contrast-text-below-aa": "warn" } }, "rule-setting"],
  [{ rules: { "contrast-text-below-aa": ["error", { nope: 1 }] } }, "rule-option"],
  [{ rules: { "contrast-text-below-aa": ["error", { profile: "x" }] } }, "rule-option"],
  [{ rules: { "complexity-node-count-hard-limit": ["error", { preset: "x" }] } }, "rule-option"],
  [{ rules: { "complexity-node-count-hard-limit": ["error", { nodeIdeal: "x" }] } }, "rule-option"],
  [{ extra: 1 }, "config-shape"],
  [{ plugins: "x" }, "config-shape"],
  [{ pluginLoading: "x" }, "config-shape"],
  [[], "config-shape"],
];

describe("config rule settings", () => {
  test("a rule can be switched off and given options", async () => {
    const bad = fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n  class A c");
    const root = tempProject({
      "a.md": bad,
      "mermaidjs-lint.config.json": JSON.stringify({ rules: { "contrast-text-below-aa": "off" } }),
    });
    expect((await run(root, ["a.md"])).code).toBe(0);
    const opts = tempProject({
      "a.md": fence(chain(13)),
      "mermaidjs-lint.config.json": JSON.stringify({
        rules: { "complexity-node-count-acceptable-exceeded": ["error", { preset: "low" }] },
      }),
    });
    expect((await run(opts, ["a.md"])).code).toBe(1);
  });

  test("a numeric threshold option overrides the preset", async () => {
    const root = tempProject({
      "a.md": fence(chain(6)),
      "mermaidjs-lint.config.json": JSON.stringify({
        rules: { "complexity-node-count-acceptable-exceeded": ["error", { nodeAcceptable: 4 }] },
      }),
    });
    expect((await run(root, ["a.md"])).code).toBe(1);
  });

  test("mistakes are named usage errors", async () => {
    for (const [config, code] of CONFIG_MISTAKES) {
      const r = await run(withConfig(config), ["a.md"]);
      expect(r.code).toBe(2);
      expect(r.err).toContain(`error[${code}]`);
    }
  });
});

describe("config loading", () => {
  test("two configs, a missing --config and a broken file are errors", async () => {
    const two = tempProject({
      "a.md": DOC,
      "mermaidjs-lint.config.json": "{}",
      "mermaidjs-lint.config.mjs": "export default {}",
    });
    expect((await run(two, ["a.md"])).err).toContain("config-ambiguous");
    expect((await run(two, ["a.md", "--config", "nope.json"])).err).toContain("config-not-found");
    const broken = tempProject({ "a.md": DOC, "mermaidjs-lint.config.json": "{" });
    expect((await run(broken, ["a.md"])).err).toContain("config-file");
  });

  test("an .mjs config loads, and plugins:false means built-ins only", async () => {
    const root = tempProject({
      "a.md": DOC,
      "mermaidjs-lint.config.mjs": "export default { plugins: false };",
      ".mermaidjs-lint/rules/diagram-ok.mjs": "export default { category: 'diagram', summary: 's', check: () => [] };",
    });
    expect((await run(root, ["a.md"])).err).toContain("plugins off");
  });

  test("a config can list a plugin path, and lenient loading drops its settings", async () => {
    const root = tempProject({
      "a.md": DOC,
      "mermaidjs-lint.config.json": JSON.stringify({
        plugins: ["./missing-plugin.mjs"],
        pluginLoading: "lenient",
        rules: { "ghost/parse-x": "off" },
      }),
    });
    const r = await run(root, ["a.md"]);
    expect(r.code).toBe(0);
    expect(r.err).toContain("skipped plugin ./missing-plugin.mjs");
    expect(r.err).toContain("ignored config setting for ghost/parse-x");
  });

  test("loadConfig and parseConfig are public", async () => {
    expect(parseConfig("x.json", { rules: { a: "off" } }).rules.get("a")?.severity).toBe("off");
    const root = tempProject({ "c.txt": "{}" });
    await expect(loadConfig(`${root}/c.txt`)).rejects.toBeInstanceOf(ConfigFileError);
    await expect(loadConfig(`${root}/missing.json`)).rejects.toBeInstanceOf(MermaidLintError);
  });
});

describe("main(argv, cwd)", () => {
  test("detects the auto profile from the cwd passed in, not the process's", async () => {
    // A fill with no color: is unauditable on GitHub, and scored against the
    // Material canvases under mkdocs-material, so the rule that fires names the profile.
    const doc = fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00\n  class A c");
    const mk = tempProject({ "mkdocs.yml": "site_name: m\n", "a.md": doc });
    expect(process.cwd()).not.toBe(mk);
    const r = await run(mk, ["a.md"]);
    expect(r.out).toContain("a.md:");
    expect(r.out).not.toContain("contrast-directive-unauditable");
    expect(r.out).toContain("contrast-text-below-aa");
    const plain = tempProject({ "a.md": doc });
    expect((await run(plain, ["a.md"])).out).toContain("contrast-directive-unauditable");
  });
});

describe("options a rule receives", () => {
  test("a preset reaches the rule by its canonical name, whatever alias was given", async () => {
    const rule = { options: { preset: "string", profile: "string" } } as unknown as Parameters<typeof optionsFor>[0];
    expect(optionsFor(rule, undefined, { preset: "H" }).preset).toBe("high-density");
    expect(optionsFor(rule, { preset: "low" }, {}).preset).toBe("low-density");
    expect(optionsFor(rule, undefined, {}).preset).toBeUndefined();
    expect(optionsFor(rule, undefined, { profile: "github" }).profile).toBe("github");
  });
});
