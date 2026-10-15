import { describe, expect, test } from "bun:test";
import { checkRule, fixRule, localPlugin } from "../src/testing.ts";
import { fence, runCli, tempProject } from "./helpers.ts";

const DOC = fence("flowchart LR\n  A --> B\n  B --> C");

const LOCAL_RULE = `export default {
  category: "diagram",
  summary: "a diagram with a node named C",
  check: ({ doc, helpers }) =>
    doc.diagrams
      .filter((d) => d.source.includes("C") && helpers.detectKeyword(d.source) === "flowchart")
      .map((d) => ({ line: d.startLine, endLine: d.endLine, message: "node C", remediation: "rename C" })),
};
export const categories = { diagram: "House rules about a diagram" };
`;

describe("local rules", () => {
  test("load on their own, namespaced local, and report a range", async () => {
    const root = tempProject({ "a.md": DOC, ".mermaidjs-lint/rules/diagram-no-c.mjs": LOCAL_RULE });
    const r = await runCli(root, ["a.md"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("a.md:1-5 local/diagram-no-c node C");
    expect(r.stderr).toContain("loaded local (1 rule)");
  });

  test("--no-plugins runs built-ins only and says what it skipped", async () => {
    const root = tempProject({ "a.md": DOC, ".mermaidjs-lint/rules/diagram-no-c.mjs": LOCAL_RULE });
    const r = await runCli(root, ["a.md", "--no-plugins"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("plugins off");
  });

  test("a bad plugin stops the run, naming its source and code", async () => {
    const root = tempProject({ "a.md": DOC, ".mermaidjs-lint/rules/diagram-bad.mjs": "export default {}" });
    const r = await runCli(root, ["a.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("error[plugin-contract]");
  });

  test("lenient loading skips it, says so, and runs the rest", async () => {
    const root = tempProject({
      "a.md": DOC,
      ".mermaidjs-lint/rules/diagram-bad.mjs": "export default {}",
      ".mermaidjs-lint/rules/diagram-no-c.mjs": LOCAL_RULE,
    });
    const r = await runCli(root, ["a.md", "--lenient-plugins"]);
    expect(r.stderr).toContain("skipped plugin");
    expect(r.stdout).toContain("local/diagram-no-c");
  });

  test("--validate-plugins reports every failure and runs no check", async () => {
    const root = tempProject({
      ".mermaidjs-lint/rules/diagram-bad.mjs": "export default {}",
      ".mermaidjs-lint/rules/nocategory.mjs": "export default { summary: 'x', check: () => [] }",
    });
    const r = await runCli(root, ["--validate-plugins"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("2 of 2 sources");
    const ok = await runCli(tempProject({}), ["--validate-plugins"]);
    expect(ok.stdout).toContain("no plugins found");
  });

  test("a throwing check becomes a finding and the others carry on", async () => {
    const root = tempProject({
      "a.md": DOC,
      ".mermaidjs-lint/rules/diagram-boom.mjs": `export default { category: "diagram", summary: "x", check: () => { throw new Error("boom"); } };
export const categories = { diagram: "d" };`,
    });
    const r = await runCli(root, ["a.md"]);
    expect(r.stdout).toContain("local/diagram-boom plugin rule threw: boom");
  });
});

describe("plugin packages", () => {
  const pkg = (name: string, body: string): Record<string, string> => ({
    [`node_modules/${name}/package.json`]: JSON.stringify({ name, type: "module", main: "index.js" }),
    [`node_modules/${name}/index.js`]: body,
  });
  const PLUGIN = `export default {
  meta: { name: "acme", namespace: "acme", apiVersion: 1 },
  rules: { "parse-has-c": { category: "parse", summary: "has C", check: ({ doc }) =>
    doc.diagrams.map((d) => ({ line: d.startLine, message: "C here" })) } },
};`;

  test("a declared package loads and is configurable like a built-in", async () => {
    const files = {
      "a.md": DOC,
      "package.json": JSON.stringify({ devDependencies: { "mermaidjs-lint-plugin-acme": "1.0.0" } }),
      ...pkg("mermaidjs-lint-plugin-acme", PLUGIN),
    };
    const root = tempProject(files);
    expect((await runCli(root, ["a.md"])).stdout).toContain("acme/parse-has-c C here");
    const off = tempProject({
      ...files,
      "mermaidjs-lint.config.json": JSON.stringify({ rules: { "acme/parse-has-c": "off" } }),
    });
    expect((await runCli(off, ["a.md"])).code).toBe(0);
  });

  test("a package that claims an API version this tool lacks fails with both numbers", async () => {
    const root = tempProject({
      "a.md": DOC,
      "package.json": JSON.stringify({ devDependencies: { "mermaidjs-lint-plugin-acme": "1.0.0" } }),
      ...pkg("mermaidjs-lint-plugin-acme", PLUGIN.replace("apiVersion: 1", "apiVersion: 9")),
    });
    const r = await runCli(root, ["a.md"]);
    expect(r.stderr).toContain("apiVersion 9");
    expect(r.stderr).toContain("supports 1");
  });

  test("a declared package that is not installed is a named error", async () => {
    const root = tempProject({
      "a.md": DOC,
      "package.json": JSON.stringify({ devDependencies: { "mermaidjs-lint-plugin-ghost": "1.0.0" } }),
    });
    const r = await runCli(root, ["a.md"]);
    expect(r.stderr).toContain("error[plugin-not-installed]");
  });
});

describe("testing helper", () => {
  const mod = {
    default: {
      category: "diagram",
      summary: "a spaced arrow",
      check: ({ doc }: { doc: { diagrams: { source: string; startLine: number }[] } }) =>
        doc.diagrams.filter((d) => d.source.includes(" --> ")).map((d) => ({ line: d.startLine, message: "spaced" })),
      fix: ({ doc }: { doc: { src: string } }) => {
        const at = doc.src.indexOf(" --> ");
        return at < 0 ? [] : [{ start: at, end: at + 5, text: "-->", expect: { kind: "same-diagrams" as const } }];
      },
    },
    categories: { diagram: "d" },
  };

  test("runs a rule and its fixer under the real engine", async () => {
    const plugin = localPlugin("diagram-no-red", mod);
    const src = fence("flowchart LR\n  red --> B");
    expect(await checkRule(plugin, "diagram-no-red", src)).toHaveLength(1);
    const fixed = await fixRule(plugin, "diagram-no-red", src);
    expect(fixed.output).toContain("red-->B");
    expect(fixed.refused).toEqual([]);
  });

  test("a fix that changes the diagram's structure is refused", async () => {
    const plugin = localPlugin("diagram-no-red", {
      ...mod,
      default: {
        ...mod.default,
        fix: ({ doc }: { doc: { src: string } }) => [
          {
            start: doc.src.indexOf("red"),
            end: doc.src.indexOf("red") + 3,
            text: "red --> Z\n  Z",
            expect: { kind: "same-diagrams" as const },
          },
        ],
      },
    });
    const src = fence("flowchart LR\n  red --> B");
    const out = await fixRule(plugin, "diagram-no-red", src);
    expect(out.output).toBe(src);
    expect(out.refused).toHaveLength(1);
  });

  test("an unknown key names the rules the plugin has", async () => {
    const plugin = localPlugin("diagram-no-red", mod);
    expect(() => checkRule(plugin, "missing", "x")).toThrow("has no rule");
  });
});

describe("package.json errors carry a code", () => {
  test("a malformed project package.json prints error[package-json] and exits 1", async () => {
    const root = tempProject({ "package.json": "{bad", "a.md": DOC });
    const r = await runCli(root, ["a.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("error[package-json]: ");
    expect(r.stderr).toContain("package.json is not a JSON object");
  });

  test("--no-plugins reads no package from it, so a malformed one does not stop the run", async () => {
    const root = tempProject({ "package.json": "{bad", "a.md": DOC });
    const r = await runCli(root, ["a.md", "--no-plugins"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 finding(s) in 1 file(s)");
  });

  test("a plugin whose own package.json is malformed is a plugin-source failure a lenient run skips", async () => {
    const files = {
      "a.md": DOC,
      "package.json": JSON.stringify({ devDependencies: { "mermaidjs-lint-plugin-acme": "1.0.0" } }),
      "node_modules/mermaidjs-lint-plugin-acme/package.json": "{bad",
    };
    const strict = await runCli(tempProject(files), ["a.md"]);
    expect(strict.code).toBe(1);
    expect(strict.stderr).toContain("error[plugin-source]: plugin mermaidjs-lint-plugin-acme: its package.json");
    const lenient = await runCli(tempProject(files), ["a.md", "--lenient-plugins"]);
    expect(lenient.code).toBe(0);
    expect(lenient.stderr).toContain("skipped plugin mermaidjs-lint-plugin-acme [plugin-source]");
  });

  test("a config plugins entry that is not installed is reported with kind config", async () => {
    const root = tempProject({
      "a.md": DOC,
      "mermaidjs-lint.config.json": JSON.stringify({ plugins: ["acme-not-installed"] }),
    });
    const r = await runCli(root, ["a.md", "--lenient-plugins", "--json"]);
    const out = JSON.parse(r.stdout) as { skippedPlugins: { source: string; kind: string; code: string }[] };
    expect(out.skippedPlugins).toEqual([
      expect.objectContaining({ source: "acme-not-installed", kind: "config", code: "plugin-not-installed" }),
    ]);
  });
});

describe("local rule files that share a base name", () => {
  const RULE_BODY = (message: string): string =>
    `export default { category: "diagram", summary: "x", check: ({ doc }) => doc.diagrams.map((d) => ({ line: d.startLine, message: "${message}" })) };
export const categories = { diagram: "d" };`;
  const files = {
    "a.md": DOC,
    ".mermaidjs-lint/rules/diagram-x.js": RULE_BODY("from js"),
    ".mermaidjs-lint/rules/diagram-x.mjs": RULE_BODY("from mjs"),
  };

  test("fail the load with plugin-contract, naming both files", async () => {
    const r = await runCli(tempProject(files), ["a.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("error[plugin-contract]");
    expect(r.stderr).toContain(".mermaidjs-lint/rules/diagram-x.js");
    expect(r.stderr).toContain(".mermaidjs-lint/rules/diagram-x.mjs");
    expect(r.stdout).not.toContain("from js");
    expect(r.stdout).not.toContain("from mjs");
  });

  test("--validate-plugins reports the clash instead of calling the set valid", async () => {
    const r = await runCli(tempProject(files), ["--validate-plugins"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("plugin validation failed");
    expect(r.stderr).toContain('rule "diagram-x" is defined by more than one file');
    expect(r.stdout).not.toContain("plugins valid");
  });
});

describe("contract tightening", () => {
  const rule = (extra: Record<string, unknown> = {}) => ({
    default: { category: "diagram", summary: "x", check: () => [], ...extra },
    categories: { diagram: "d" },
  });

  test("an option named preset or profile must be a string, the built-in meaning", () => {
    expect(() => localPlugin("diagram-a", rule({ options: { preset: "number" } }))).toThrow(
      '"preset" is reserved for the built-in preset',
    );
    expect(() => localPlugin("diagram-a", rule({ options: { profile: "boolean" } }))).toThrow(
      '"profile" is reserved for the built-in profile',
    );
    expect(localPlugin("diagram-a", rule({ options: { profile: "string" } })).rules["diagram-a"]).toBeDefined();
  });

  test("a key or namespace with a trailing or doubled hyphen is refused", () => {
    expect(() => localPlugin("diagram-", rule())).toThrow("is not a valid key");
    expect(() => localPlugin("diagram--a", rule())).toThrow("is not a valid key");
    const plugin = { meta: { name: "a", namespace: "a-", apiVersion: 1 }, rules: {} };
    expect(() => checkRule(plugin, "x", "")).toThrow("meta.namespace must be lower-case words joined by hyphens");
  });
});
