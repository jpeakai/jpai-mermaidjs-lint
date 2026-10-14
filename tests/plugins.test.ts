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
