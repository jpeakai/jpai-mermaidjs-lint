import { describe, expect, test } from "bun:test";
import { parseConfig } from "../src/config.ts";
import { FlagError } from "../src/errors.ts";
import { FIX_ORDER, RULES } from "../src/rules/index.ts";
import { BUILTIN_CATEGORIES, buildRegistry } from "../src/rules/registry.ts";
import { chain, fence, runCli, tempProject } from "./helpers.ts";

// A yellow fill with near-white text: one contrast-text-below-aa finding.
const BAD = fence("flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n  class A c");
// Thirteen nodes: clean at high-density, over the readable threshold at low-density.
const LONG = fence(chain(13));

const CONTRAST_OFF = JSON.stringify({
  rules: {
    "contrast-text-below-aa": "off",
    "contrast-border-below-ui-minimum": "off",
    "contrast-directive-unauditable": "off",
  },
});

const LOCAL_RULE = `export default {
  category: "diagram",
  summary: "a diagram with a node named B",
  check: ({ doc }) => doc.diagrams.filter((d) => d.source.includes("B")).map((d) => ({ line: d.startLine, message: "node B" })),
};
export const categories = { diagram: "House rules about a diagram" };
`;

describe("--disable-category", () => {
  test("turns a category off for the run", async () => {
    const root = tempProject({ "a.md": BAD });
    expect((await runCli(root, ["a.md"])).code).toBe(1);
    const r = await runCli(root, ["a.md", "--disable-category", "contrast"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 finding(s) in 1 file(s)");
  });

  test("leaves the other categories running", async () => {
    const root = tempProject({ "a.md": LONG });
    const r = await runCli(root, ["a.md", "--preset", "low", "--disable-category", "contrast"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("complexity-node-count-acceptable-exceeded");
  });

  test("takes a comma-separated list or a repeated flag", async () => {
    const root = tempProject({ "a.md": `${BAD}\n${LONG}` });
    for (const flags of [
      ["--disable-category", "parse,complexity"],
      ["--disable-category", "parse", "--disable-category", "complexity"],
    ]) {
      const r = await runCli(root, ["a.md", "--preset", "low", ...flags]);
      expect(r.stdout).toContain("contrast-text-below-aa");
      expect(r.stdout).not.toContain("complexity-");
    }
  });

  test("turns off a plugin's category", async () => {
    const root = tempProject({ "a.md": BAD, ".mermaidjs-lint/rules/diagram-no-b.mjs": LOCAL_RULE });
    expect((await runCli(root, ["a.md"])).stdout).toContain("local/diagram-no-b");
    const r = await runCli(root, ["a.md", "--disable-category", "diagram"]);
    expect(r.stdout).not.toContain("local/diagram-no-b");
    expect(r.stdout).toContain("contrast-text-below-aa");
  });

  test("turns a fixer off with its check", async () => {
    const root = tempProject({ "a.md": BAD });
    const r = await runCli(root, ["a.md", "--fix", "--disable-category", "contrast"]);
    expect(r.code).toBe(0);
    expect(await Bun.file(`${root}/a.md`).text()).toBe(BAD);
  });
});

describe("--category", () => {
  test("turns on a category the config turns off", async () => {
    const root = tempProject({ "a.md": BAD, "mermaidjs-lint.config.json": CONTRAST_OFF });
    expect((await runCli(root, ["a.md"])).code).toBe(0);
    const r = await runCli(root, ["a.md", "--category", "contrast"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("contrast-text-below-aa");
  });

  test("runs a re-enabled rule with the options the config gives it", async () => {
    const config = JSON.stringify({
      rules: { "complexity-node-count-acceptable-exceeded": ["off", { preset: "low" }] },
    });
    const root = tempProject({ "a.md": LONG, "c.json": config });
    const r = await runCli(root, ["a.md", "--config", "c.json", "--category", "complexity"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("complexity-node-count-acceptable-exceeded");
  });

  test("leaves the config's other settings alone", async () => {
    const root = tempProject({ "a.md": BAD, "mermaidjs-lint.config.json": CONTRAST_OFF });
    const r = await runCli(root, ["a.md", "--category", "parse"]);
    expect(r.code).toBe(0);
  });
});

describe("category flag errors", () => {
  test.each([
    [["--disable-category", "colour"], 'error[flag]: --disable-category names no loaded category "colour"'],
    [["--category", "colour"], 'error[flag]: --category names no loaded category "colour"'],
    [["--category", "parse", "--disable-category", "parse"], "both name parse"],
    [["--disable-category", "parse,complexity,contrast"], "--disable-category leaves no rule to run"],
    [["--disable-category", "parse,"], '--disable-category needs a category name, not "parse,"'],
  ])("%p is a usage error", async (flags, message) => {
    const root = tempProject({ "a.md": BAD });
    const r = await runCli(root, ["a.md", ...flags]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(message);
  });

  test("a plugin category is unknown when plugins are off", async () => {
    const root = tempProject({ "a.md": BAD, ".mermaidjs-lint/rules/diagram-no-b.mjs": LOCAL_RULE });
    const r = await runCli(root, ["a.md", "--no-plugins", "--disable-category", "diagram"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('names no loaded category "diagram"; the categories are parse, complexity, contrast');
  });

  test("--validate-plugins refuses a category flag", async () => {
    const r = await runCli(tempProject({}), ["--validate-plugins", "--category", "parse"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("--validate-plugins checks every plugin, so it takes no category flag");
  });
});

describe("--list-rules with category flags", () => {
  test("previews the rules a run would use", async () => {
    const root = tempProject({ "mermaidjs-lint.config.json": CONTRAST_OFF });
    const off = await runCli(root, ["--list-rules", "--disable-category", "parse"]);
    expect(off.code).toBe(0);
    expect(off.stdout).not.toContain("parse-");
    expect(off.stdout).not.toContain("contrast-");
    const on = await runCli(root, ["--list-rules", "--category", "contrast"]);
    expect(on.stdout).toContain("contrast-text-below-aa");
  });
});

describe("buildRegistry selection", () => {
  const build = (selection: Parameters<typeof buildRegistry>[0]["selection"], raw: unknown = {}) =>
    buildRegistry({
      rules: RULES,
      fixOrder: FIX_ORDER,
      categories: BUILTIN_CATEGORIES,
      config: parseConfig("c.json", raw),
      selection,
    });

  test("disable drops the category from rules, fix order and the enabled set", () => {
    const registry = build({ disable: ["contrast"] });
    expect(registry.rules.some((r) => r.category === "contrast")).toBe(false);
    expect(registry.fixOrder.some((r) => r.category === "contrast")).toBe(false);
    expect(registry.enabled.has("contrast-text-below-aa")).toBe(false);
  });

  test("enable wins over the config's off", () => {
    const registry = build({ enable: ["contrast"] }, JSON.parse(CONTRAST_OFF));
    expect(registry.enabled.has("contrast-text-below-aa")).toBe(true);
  });

  test("a library caller's error names the RegistryInput field", () => {
    expect(() => build({ disable: ["colour"] })).toThrow(FlagError);
    expect(() => build({ disable: ["colour"] })).toThrow('selection.disable names no loaded category "colour"');
    expect(() => build({ enable: ["parse"], disable: ["parse"] })).toThrow(
      "selection.enable and selection.disable both name parse",
    );
  });
});
