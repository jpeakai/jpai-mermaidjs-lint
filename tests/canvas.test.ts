// The page canvas: a host that draws its own page sets the colour behind
// everything page-backed, by flag, by config or through the library. It applies
// under the github profile only, and a bad colour is a named usage error.

import { describe, expect, test } from "bun:test";
import { optionsFor } from "../src/check.ts";
import {
  CanvasProfileError,
  canvasSetAside,
  checkMarkdown,
  GITHUB_CANVAS as EXPORTED,
  FlagError,
  type RunFlags,
  setUp,
} from "../src/index.ts";
import { edgeLabelBackground, GITHUB_CANVAS, scoreGithub, scoreSequence } from "../src/parse/contrast.ts";
import { readStyles } from "../src/parse/styles.ts";
import { checkRule, localPlugin } from "../src/testing.ts";
import { fence, runCli, tempProject } from "./helpers.ts";

// A lifeline colour that clears 3:1 on both GitHub canvases (4.48 and 4.18),
// but not on a mid-grey dark page (2.54) or a light grey one (2.46).
const LIFELINE = '%%{init: {"themeVariables": {"actorLineColor": "#777777"}}}%%\nsequenceDiagram\n  A->>B: hi';
const DOC = fence(LIFELINE);
const BORDER = "contrast-border-below-ui-minimum";

// A translucent fill whose border clears 3:1 on both GitHub canvases (3.45 and
// 4.22), but not once the dark page is mid-grey (2.41). The black label fails
// in dark either way.
const TRANSLUCENT = "flowchart LR\n  A --> B\n  classDef c fill:#ffffff1a,stroke:#8a8a8a,color:#000000\n  class A c";

const OSAKA = { light: "#faf8f9", dark: "#101010" };

const rules = async (src: string, flags: RunFlags = {}): Promise<string[]> =>
  (await checkMarkdown(src, "doc.md", flags)).map((f) => f.rule);

describe("scoring on a canvas", () => {
  test("GitHub's canvas stays the default and is exported", () => {
    expect(GITHUB_CANVAS).toEqual({ light: "#ffffff", dark: "#0d1117" });
    expect(EXPORTED).toBe(GITHUB_CANVAS);
  });

  test("a page-backed pair that passes on GitHub's dark canvas fails on a custom one", async () => {
    expect(await rules(DOC)).toEqual([]);
    const found = await checkMarkdown(DOC, "doc.md", { canvas: { dark: "#3a3a3a" } });
    expect(found.map((f) => f.rule)).toEqual([BORDER]);
    expect(found[0]?.message).toContain("actorLineColor: border 2.54:1 < 3 (#777777 on #3a3a3a, dark)");
  });

  test("a side left out keeps GitHub's", async () => {
    const found = await checkMarkdown(DOC, "doc.md", { canvas: { light: "#c0c0c0" } });
    expect(found.map((f) => f.message)).toEqual([
      "themeVariables actorLineColor: border 2.46:1 < 3 (#777777 on #c0c0c0, light)",
    ]);
  });

  test("a translucent fill composites onto the canvas", async () => {
    expect(await rules(fence(TRANSLUCENT))).not.toContain(BORDER);
    expect(await rules(fence(TRANSLUCENT), { canvas: { dark: "#3a3a3a" } })).toContain(BORDER);
    const { pairs } = scoreGithub((await readStyles(TRANSLUCENT)).directives, { light: "#ffffff", dark: "#3a3a3a" });
    expect(pairs.find((p) => p.kind === "border" && p.theme === "dark")?.background).toBe("#4e4e4e");
  });

  test("an edge label box sits on the canvas", () => {
    // The label box is nearly opaque, so the canvas shows through it only a little.
    expect(edgeLabelBackground("light")).toBe("#e8e8e8");
    expect(edgeLabelBackground("light", { light: "#000000", dark: "#000000" })).toBe("#e3e3e3");
  });

  test("sequence page text is scored on the canvas the host draws", async () => {
    const { pairs } = await scoreSequence("sequenceDiagram\n  A->>B: hi", "github", OSAKA);
    const message = pairs.filter((p) => p.selector === "signalTextColor");
    expect(message.map((p) => p.background)).toEqual(["#faf8f9", "#101010"]);
    expect(message.every((p) => p.passes)).toBe(true);
  });

  test("an erDiagram's rows are Mermaid's own, so a canvas changes nothing", async () => {
    const er = fence("erDiagram\n  A ||--o{ B : has\n  classDef c fill:#1d4ed836\n  class A c");
    expect(await rules(er, { canvas: { light: "#000000", dark: "#ffffff" } })).toEqual(await rules(er));
  });
});

describe("library flags", () => {
  test("a colour that will not parse, or is translucent, is a FlagError naming the field", async () => {
    for (const [canvas, problem] of [
      [{ dark: "nope" }, "canvas.dark is not a CSS colour"],
      [{ light: "#ffffff80" }, "canvas.light is translucent"],
    ] as const) {
      const err = await checkMarkdown(DOC, "doc.md", { canvas }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(FlagError);
      expect((err as FlagError).flag).toBe(Object.keys(canvas)[0] === "dark" ? "canvas.dark" : "canvas.light");
      expect((err as FlagError).message).toContain(problem);
    }
  });

  test("a canvas under an explicit mkdocs-material profile is refused", async () => {
    const err = await checkMarkdown(DOC, "doc.md", { profile: "mkdocs-material", canvas: OSAKA }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FlagError);
    expect((err as FlagError).message).toContain("applies under the github profile only");
  });

  test("a flag sets its side over the configured canvas", () => {
    const rule = { options: { canvas: "canvas" } } as unknown as Parameters<typeof optionsFor>[0];
    expect(optionsFor(rule, { canvas: { light: "#c0c0c0" } }, { canvas: { dark: "#101010" } }).canvas).toEqual({
      light: "#c0c0c0",
      dark: "#101010",
    });
    expect(optionsFor(rule, { canvas: { light: "#c0c0c0" } }, {}).canvas).toEqual({ light: "#c0c0c0" });
    expect(optionsFor(rule, undefined, { canvas: { light: "#eeeeee" } }).canvas).toEqual({ light: "#eeeeee" });
    // A rule that declares no canvas, or one of another type, never receives the flag.
    const other = { options: { canvas: "string" } } as unknown as Parameters<typeof optionsFor>[0];
    expect(optionsFor(other, undefined, { canvas: OSAKA }).canvas).toBeUndefined();
  });

  test("a flag reaches every option of the canvas type, whatever its name", () => {
    const rule = { options: { canvas: "canvas", page: "canvas", label: "string" } } as unknown as Parameters<
      typeof optionsFor
    >[0];
    const options = optionsFor(rule, { page: { light: "#eeeeee" } }, { canvas: { dark: "#222222" } });
    expect(options.canvas).toEqual({ dark: "#222222" });
    expect(options.page).toEqual({ light: "#eeeeee", dark: "#222222" });
    expect(options.label).toBeUndefined();
  });

  test("a canvas profile error names the way out of the setting that caused it", () => {
    expect(new CanvasProfileError("a.md").message).toContain("over the GitHub-rendered paths only");
    expect(new CanvasProfileError("a.md", "profile").message).toContain("remove the mkdocs-material profile setting");
  });
});

describe("command flags", () => {
  test("--canvas-light and --canvas-dark score the page the host draws", async () => {
    const root = tempProject({ "a.md": DOC });
    expect((await runCli(root, ["a.md"])).code).toBe(0);
    expect((await runCli(root, ["a.md", "--canvas-light", OSAKA.light, "--canvas-dark", OSAKA.dark])).code).toBe(0);
    const r = await runCli(root, ["a.md", "--canvas-dark", "#3a3a3a"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(`${BORDER} themeVariables actorLineColor: border 2.54:1`);
  });

  test("a bad colour exits 2 naming the flag", async () => {
    const root = tempProject({ "a.md": DOC });
    for (const [args, text] of [
      [["--canvas-dark", "nope"], "error[flag]: --canvas-dark is not a CSS colour"],
      [["--canvas-light", "rgb(0 0 0 / 0.5)"], "error[flag]: --canvas-light is translucent"],
      [["--canvas-light", "#ffffff", "--profile", "mkdocs-material"], "--canvas-light applies under the github"],
    ] as const) {
      const r = await runCli(root, ["a.md", ...args]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(text);
      expect(r.stderr).toContain("usage:");
    }
  });

  test("a file the auto profile reads as mkdocs-material refuses a canvas", async () => {
    const root = tempProject({ "mkdocs.yml": "site_name: x\n", "docs/a.md": DOC });
    expect((await runCli(root, ["docs/a.md"])).code).toBe(0);
    const r = await runCli(root, ["docs/a.md", "--canvas-dark", "#101010"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[canvas-profile]");
    expect(r.stderr).toContain("whose page is Material's own");
    expect(r.stderr).toContain("set the canvas in the config, which a Material file sets aside");
  });

  test("--help documents the canvas flags", async () => {
    const { stdout } = await runCli(tempProject({}), ["--help"]);
    expect(stdout).toContain("--canvas-light COLOUR and --canvas-dark COLOUR");
    expect(stdout).toContain("(#ffffff light, #0d1117 dark)");
  });
});

describe("config", () => {
  const withConfig = (rules: unknown): string =>
    tempProject({ "a.md": DOC, "mermaidjs-lint.config.json": JSON.stringify({ rules }) });

  test("a canvas option scores that rule on the host's page, and a flag overrides one side", async () => {
    const root = withConfig({ [BORDER]: ["error", { canvas: { light: "#c0c0c0" } }] });
    const r = await runCli(root, ["a.md"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("#777777 on #c0c0c0, light");
    const both = await runCli(root, ["a.md", "--canvas-dark", "#3a3a3a"]);
    expect(both.stdout).toContain("#777777 on #c0c0c0, light");
    expect(both.stdout).toContain("#777777 on #3a3a3a, dark");
    expect((await runCli(root, ["a.md", "--canvas-light", "#ffffff"])).code).toBe(0);
  });

  test("a wrong canvas is a named rule-option error", async () => {
    const cases: Array<[unknown, string]> = [
      ["#ffffff", 'option "canvas" of "contrast-border-below-ui-minimum" must be an object such as'],
      [{}, "must be an object such as"],
      [{ light: "#ffffff", mid: "#888888" }, "must be an object such as"],
      [{ dark: "nope" }, 'option "canvas.dark" of "contrast-border-below-ui-minimum" is not a CSS colour: "nope"'],
      [{ dark: 7 }, 'option "canvas.dark" of "contrast-border-below-ui-minimum" is not a colour string'],
      [{ light: "#ffffff00" }, "is translucent, and a page canvas must be opaque"],
    ];
    for (const [canvas, text] of cases) {
      const r = await runCli(withConfig({ [BORDER]: ["error", { canvas }] }), ["a.md"]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("error[rule-option]");
      expect(r.stderr).toContain(text);
    }
  });

  test("a canvas beside profile mkdocs-material is refused", async () => {
    const r = await runCli(
      withConfig({ [BORDER]: ["error", { profile: "mkdocs-material", canvas: { dark: "#101010" } }] }),
      ["a.md"],
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("applies under the github profile only");
  });

  test("a canvas flag against a configured mkdocs-material profile is refused for the file", async () => {
    const r = await runCli(withConfig({ [BORDER]: ["error", { profile: "mkdocs-material" }] }), [
      "a.md",
      "--canvas-dark",
      "#101010",
    ]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[canvas-profile]");
    expect(r.stderr).toContain("remove the mkdocs-material profile setting");
  });
});

describe("plugin rules", () => {
  // A plugin rule that declares a canvas reports the canvas it received.
  const echo = localPlugin("diagram-canvas", {
    default: {
      category: "diagram",
      summary: "echoes its canvas",
      options: { canvas: "canvas" },
      check: (ctx) => [{ line: 1, message: JSON.stringify(ctx.options.canvas ?? null) }],
    },
    categories: { diagram: "d" },
  });

  test("a plugin rule may declare a canvas, and receives the flags", async () => {
    const found = await checkRule(echo, "diagram-canvas", DOC, {
      options: { canvas: { light: "#c0c0c0" } },
      flags: { canvas: { dark: "#101010" } },
    });
    expect(found.map((f) => f.message)).toEqual(['{"light":"#c0c0c0","dark":"#101010"}']);
  });

  test("a plugin rule's canvas option of another name receives the flags too", async () => {
    const page = localPlugin("diagram-page", {
      default: {
        category: "diagram",
        summary: "echoes its page",
        options: { page: "canvas" },
        check: (ctx) => [{ line: 1, message: JSON.stringify(ctx.options.page ?? null) }],
      },
      categories: { diagram: "d" },
    });
    const found = await checkRule(page, "diagram-page", DOC, {
      options: { page: { light: "#eeeeee" } },
      flags: { canvas: { dark: "#222222" } },
    });
    expect(found.map((f) => f.message)).toEqual(['{"light":"#eeeeee","dark":"#222222"}']);
  });

  test("a plugin rule's canvas option is checked like a built-in's", async () => {
    expect(() => checkRule(echo, "diagram-canvas", DOC, { options: { canvas: { dark: "nope" } } })).toThrow(
      'option "canvas.dark" of "local/diagram-canvas" is not a CSS colour',
    );
  });
});

// The config sets a canvas on every contrast rule, and the auto profile reads
// site/docs/flow.md as mkdocs-material because site/mkdocs.yml is present.
const canvasRules = {
  "contrast-text-below-aa": ["error", { canvas: { dark: "#3a3a3a" } }],
  [BORDER]: ["error", { canvas: { dark: "#3a3a3a" } }],
  "contrast-directive-unauditable": ["error", { canvas: { dark: "#3a3a3a" } }],
};
const repo = (): string =>
  tempProject({
    "mermaidjs-lint.config.json": JSON.stringify({ rules: canvasRules }),
    "docs/flow.md": DOC,
    "site/mkdocs.yml": "site_name: x\n",
    "site/docs/flow.md": DOC,
    "site/docs/plain.md": "# No diagram\n",
  });

describe("a config canvas in a repo with a Material site", () => {
  test("sets the canvas aside for the Material files, says so once, and scores the rest on it", async () => {
    const root = repo();
    const r = await runCli(root, ["docs", "site/docs"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("docs/flow.md");
    expect(r.stdout).toContain("#777777 on #3a3a3a, dark");
    expect(r.stdout).not.toContain("site/docs/flow.md");
    expect(r.stdout).toContain("1 finding(s) in 3 file(s)");
    const notes = r.stderr.split("\n").filter((line) => line.includes("config canvas set aside"));
    expect(notes).toEqual([
      "mermaidjs-lint: config canvas set aside for 2 files scored under mkdocs-material: site/docs/flow.md, site/docs/plain.md",
    ]);
  });

  test("--json lists the set-aside files under canvasSetAside", async () => {
    const r = await runCli(repo(), ["docs", "site/docs", "--json"]);
    expect(r.code).toBe(1);
    const out = JSON.parse(r.stdout) as { canvasSetAside: string[]; files: number };
    expect(out.canvasSetAside).toEqual(["site/docs/flow.md", "site/docs/plain.md"]);
    expect(out.files).toBe(3);
  });

  test("--json carries an empty canvasSetAside when no canvas is set aside", async () => {
    const r = await runCli(repo(), ["docs", "--json"]);
    expect((JSON.parse(r.stdout) as { canvasSetAside: string[] }).canvasSetAside).toEqual([]);
  });

  test("the set-aside file scores as it does with no canvas, in check and in fix", async () => {
    const root = repo();
    const r = await runCli(root, ["site/docs/flow.md", "--fix"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("set aside for 1 file scored under mkdocs-material: site/docs/flow.md");
  });
});

describe("a config canvas in a repo with a Material site, where it is refused or asked about", () => {
  test("a canvas flag over the Material files is still refused", async () => {
    const r = await runCli(repo(), ["site/docs", "--canvas-dark", "#101010"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[canvas-profile]");
  });

  test("an explicit --profile mkdocs-material with a config canvas is still refused", async () => {
    const r = await runCli(repo(), ["docs", "--profile", "mkdocs-material"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("error[canvas-profile]");
    expect(r.stderr).toContain("remove the mkdocs-material profile setting");
  });

  test("the library reports which files set the canvas aside", async () => {
    const root = repo();
    const { registry } = await setUp({ cwd: root });
    expect(canvasSetAside(`${root}/site/docs/flow.md`, {}, registry)).toBe(true);
    expect(canvasSetAside(`${root}/docs/flow.md`, {}, registry)).toBe(false);
    expect(canvasSetAside(`${root}/site/docs/flow.md`, { canvas: { dark: "#101010" } }, registry)).toBe(false);
    expect(canvasSetAside(`${root}/site/docs/flow.md`)).toBe(false);
  });
});
