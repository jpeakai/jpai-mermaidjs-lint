// Sequence diagram contrast. The cases under "ported" are the sequence
// regression tests of the mermaidjs-diagrams skill's mermaid_contrast.ts, which
// this audit replaces. Every colour is resolved by Mermaid's own theme engine,
// so the expected ratios move only when the pinned Mermaid version does.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkMarkdown, fixSource, RULE } from "../src/index.ts";
import { type ContrastPair, scoreSequence } from "../src/parse/contrast.ts";
import { fence, runCli, tempProject } from "./helpers.ts";

const BAD_SEQUENCE = `---
config:
  theme: base
  themeVariables:
    actorBkg: "#2563eb"
    actorTextColor: "#ffffff"
    actorBorder: "#1e40af"
    signalColor: "#475569"
    signalTextColor: "#475569"
    noteBkgColor: "#475569"
    noteTextColor: "#ffffff"
---
sequenceDiagram
    actor R as Reviewer
    participant V as Viewer
    R->>V: Mark section reviewed
    Note over R,V: In memory only
`;

const GOOD_SEQUENCE = `---
config:
  themeVariables:
    actorBkg: "#dbeafe"
    actorTextColor: "#1e3a8a"
    actorBorder: "#1e3a8a"
    labelBoxBkgColor: "#dbeafe"
    labelTextColor: "#1e3a8a"
    noteBkgColor: "#475569"
    noteTextColor: "#ffffff"
---
sequenceDiagram
    participant R as Reviewer
    participant V as Viewer
    R->>V: Mark section reviewed
    loop Heading and descendants
        V->>R: Synchronize status
    end
    Note over R,V: In memory only
`;

const github = (source: string) => scoreSequence(source, "github");
const failing = (pairs: ContrastPair[]): ContrastPair[] => pairs.filter((p) => !(p.passes || p.advisory));
const find = (pairs: ContrastPair[], selector: string, theme?: string): ContrastPair | undefined =>
  pairs.find((p) => p.selector === selector && (theme === undefined || p.theme === theme));

describe("ported: sequence theme contrast of actors and messages", () => {
  test("human actor labels and glyphs must also contrast with the page", async () => {
    const { pairs } = await github(GOOD_SEQUENCE.replace("participant R as Reviewer", "actor R as Reviewer"));
    expect(find(pairs, "actorTextColor (human actor label)", "dark")?.passes).toBe(false);
    expect(find(pairs, "actorBorder (human actor glyph)", "dark")?.passes).toBe(false);
    expect(pairs.filter((p) => p.selector === "actorTextColor").every((p) => p.passes)).toBe(true);
  });

  test("unmodified human actors retain theme-adaptive labels", async () => {
    const { pairs } = await github("sequenceDiagram\nactor A as Reviewer\nparticipant B as Viewer\nA->>B: Review");
    expect(failing(pairs)).toEqual([]);
    expect(pairs.filter((p) => p.selector === "actorTextColor (human actor label)")).toHaveLength(2);
  });

  test("the shipped dark-mode regression gates message text and arrows", async () => {
    const { pairs } = await github(BAD_SEQUENCE);
    expect(failing(pairs).length).toBeGreaterThan(0);
    for (const selector of ["signalTextColor", "signalColor"]) {
      const pair = find(pairs, selector, "dark");
      expect(pair?.passes).toBe(false);
      expect(pair?.background).toBe("#0d1117");
    }
    expect(find(pairs, "noteTextColor")?.passes).toBe(true);
  });

  test("adaptive message colours and explicit box colours pass in both themes", async () => {
    const { pairs, skipped } = await github(GOOD_SEQUENCE);
    expect(failing(pairs)).toEqual([]);
    expect(skipped).toEqual([]);
    expect(pairs.filter((p) => p.selector === "signalTextColor").map((p) => p.theme)).toEqual(["light", "dark"]);
    expect(pairs.filter((p) => p.selector === "signalColor").every((p) => p.passes)).toBe(true);
    expect(find(pairs, "loopTextColor", "dark")).toBeDefined();
  });
});

describe("ported: sequence theme contrast of directives, notes and boxes", () => {
  test("init JSON directives are audited, not silently skipped", async () => {
    const { pairs } = await github(
      '%%{init: {"themeVariables":{"signalTextColor":"#475569"}}}%%\nsequenceDiagram\nA->>B: Message',
    );
    expect(find(pairs, "signalTextColor", "dark")?.passes).toBe(false);
  });

  test("single-quoted init directives follow Mermaid's quote normalisation", async () => {
    const { pairs, skipped } = await github(
      "%%{init: {'themeVariables':{'signalTextColor':'#475569'}}}%%\nsequenceDiagram\nA->>B: Message",
    );
    expect(find(pairs, "signalTextColor", "dark")?.passes).toBe(false);
    expect(skipped).toEqual([]);
  });

  test("translucent actors are composited against the host canvas", async () => {
    const { pairs } = await github(
      '%%{init: {"themeVariables":{"actorBkg":"#ffffff80","actorTextColor":"#ffffff"}}}%%\nsequenceDiagram\nA->>B: Message',
    );
    const actors = pairs.filter((p) => p.selector === "actorTextColor");
    expect(actors).toHaveLength(2);
    expect(actors.every((p) => !p.passes)).toBe(true);
  });

  test("notes fail independently of readable actors and signals", async () => {
    const { pairs } = await github(GOOD_SEQUENCE.replace('noteTextColor: "#ffffff"', 'noteTextColor: "#475569"'));
    const notes = pairs.filter((p) => p.selector === "noteTextColor");
    expect(notes).toHaveLength(2);
    expect(notes.every((p) => !p.passes)).toBe(true);
  });

  test("loop descriptions use page contrast instead of the label box", async () => {
    const { pairs } = await github(
      GOOD_SEQUENCE.replace('labelTextColor: "#1e3a8a"', 'labelTextColor: "#1e3a8a"\n    loopTextColor: "#ffffff"'),
    );
    expect(find(pairs, "loopTextColor", "light")?.passes).toBe(false);
    expect(pairs.filter((p) => p.selector === "labelTextColor").every((p) => p.passes)).toBe(true);
  });

  test("themeVariables.background does not paint a transparent SVG", async () => {
    const { pairs } = await github(
      BAD_SEQUENCE.replace('actorBkg: "#2563eb"', 'background: "#ffffff"\n    actorBkg: "#2563eb"'),
    );
    expect(find(pairs, "signalTextColor", "dark")?.passes).toBe(false);
  });
});

describe("ported: sequence theme contrast on the canvas, and failing closed", () => {
  // The skill took a custom canvas by flag. Here the profile names the canvas.
  test("the profile sets the canvas a page-backed pair is scored on", async () => {
    const { pairs } = await scoreSequence(BAD_SEQUENCE, "mkdocs-material");
    expect(find(pairs, "signalColor (arrowhead)", "dark")?.background).toBe("#1e2129");
    expect(find(pairs, "signalColor (arrowhead)", "light")?.background).toBe("#ffffff");
  });

  test("unknown colours and unmodelled CSS fail closed", async () => {
    for (const source of [
      GOOD_SEQUENCE.replace("#1e3a8a", "not-a-color"),
      GOOD_SEQUENCE.replace("config:", 'config:\n  themeCSS: "text { fill: black }"'),
    ]) {
      const { skipped } = await github(source);
      expect(skipped.some((s) => s.blocking)).toBe(true);
    }
  });

  test("a finding points at the markdown line that sets the variable", async () => {
    const found = await checkMarkdown(`# Review\n\n${fence(BAD_SEQUENCE)}`, "review.md", { profile: "github" });
    const signal = found.find((f) => f.message.startsWith("themeVariables signalTextColor:"));
    expect(signal?.line).toBe(12);
  });

  test("the CLI rejects the old sequence and accepts the adaptive fix", async () => {
    const root = tempProject({ "bad.mmd": BAD_SEQUENCE, "good.mmd": GOOD_SEQUENCE });
    expect((await runCli(root, ["--profile", "github", join(root, "bad.mmd")])).code).toBe(1);
    expect((await runCli(root, ["--profile", "github", join(root, "good.mmd")])).code).toBe(0);
  });
});

describe("sequence contrast under github", () => {
  test("each failing pair is reported under the rule for its kind", async () => {
    const found = await checkMarkdown(fence(BAD_SEQUENCE), "doc.md", { profile: "github" });
    expect(found.find((f) => f.rule === RULE.TEXT)?.message).toBe(
      "themeVariables actorTextColor (human actor label): text 1.00:1 < 4.5 (#ffffff on #ffffff, light)",
    );
    expect(found.find((f) => f.rule === RULE.BORDER)?.message).toBe(
      "themeVariables actorBorder: border 1.69:1 < 3 (#1e40af on #2563eb, light)",
    );
    expect(found.every((f) => f.remediation?.includes("theme variable"))).toBe(true);
  });

  test("a diagram with no overrides passes, since Mermaid's own themes read on both canvases", async () => {
    const plain =
      "sequenceDiagram\n  autonumber\n  actor U as User\n  participant S as Server\n  U->>+S: Request\n  loop Retry\n    S-->>U: Reply\n  end\n  S->>-U: Done";
    const { pairs, skipped } = await github(plain);
    expect(failing(pairs)).toEqual([]);
    expect(skipped).toEqual([]);
    const scored = new Set(pairs.map((p) => p.selector));
    for (const selector of ["sequenceNumberColor", "activationBorderColor", "labelBoxBorderColor (loop frame)"]) {
      expect(scored.has(selector)).toBe(true);
    }
  });

  test("Mermaid's dark theme draws note text at 4.49:1, so a note with no overrides fails in dark", async () => {
    const { pairs } = await github("sequenceDiagram\n  A->>B: hi\n  Note over A,B: a note");
    expect(failing(pairs).map((p) => [p.selector, p.theme, p.assessment.ratio])).toEqual([
      ["noteTextColor", "dark", 4.49],
    ]);
  });

  test("a rect colour backs the messages inside it, and its pairs point at the rect line", async () => {
    const found = await checkMarkdown(
      fence("sequenceDiagram\n  A->>B: hi\n  rect rgb(200, 150, 255)\n    A->>B: inside\n  end"),
      "doc.md",
      { profile: "github" },
    );
    expect(found.map((f) => [f.rule, f.line, f.message.split(":")[0]])).toEqual([
      [RULE.BORDER, 4, "themeVariables signalColor (rect)"],
      [RULE.TEXT, 4, "themeVariables signalTextColor (rect)"],
    ]);
  });
});

describe("sequence contrast under github: themes, parse and fix", () => {
  test("a pinned theme applies to both canvases", async () => {
    const { pairs } = await github("%%{init: {'theme':'base'}}%%\nsequenceDiagram\n  A->>B: hi");
    const signal = pairs.filter((p) => p.selector === "signalTextColor");
    expect(signal.map((p) => p.foreground)).toEqual(["#333333", "#333333"]);
    expect(signal.map((p) => p.passes)).toEqual([true, false]);
  });

  test("a theme outside the modelled five is unauditable", async () => {
    const found = await checkMarkdown(fence("%%{init: {'theme':'neo'}}%%\nsequenceDiagram\n  A->>B: hi"), "doc.md", {
      profile: "github",
    });
    expect(found.map((f) => [f.rule, f.message])).toEqual([
      [RULE.UNAUDITABLE, "theme: unaudited, the neo theme is not modelled, only base, default, dark, forest, neutral"],
    ]);
  });

  test("an unparseable diagram is reported by the parse rule alone", async () => {
    expect((await checkMarkdown(fence("sequenceDiagram\n  A->>"), "doc.md")).map((f) => f.rule)).toEqual([
      RULE.UNPARSEABLE,
    ]);
  });

  test("resolving the theme leaves Mermaid's site config as it was", async () => {
    await github(BAD_SEQUENCE);
    const { pairs } = await github("sequenceDiagram\n  A->>B: hi");
    expect(find(pairs, "signalTextColor", "light")?.foreground).toBe("#333333");
    expect(find(pairs, "signalTextColor", "dark")?.foreground).toBe("#d3d3d3");
  });

  test("the fixer leaves theme variables alone, since it has no value span to rewrite", async () => {
    const src = fence(BAD_SEQUENCE);
    expect(await fixSource(src, "doc.md", { profile: "github" })).toBe(src);
  });
});

describe("sequence contrast under mkdocs-material", () => {
  test("Material forces every label, so a diagram's text colours are not scored", async () => {
    expect(await checkMarkdown(fence(BAD_SEQUENCE), "doc.md", { profile: "mkdocs-material" })).toEqual([]);
    const { pairs } = await scoreSequence(BAD_SEQUENCE, "mkdocs-material");
    expect(pairs.some((p) => p.kind === "text")).toBe(false);
  });

  test("lifelines, arrowheads and activation bars keep Mermaid's colours, scored as advisory borders", async () => {
    const { pairs } = await scoreSequence("sequenceDiagram\n  A->>+B: hi\n  B-->>-A: ok", "mkdocs-material");
    expect(pairs.map((p) => `${p.selector}/${p.theme}`)).toEqual([
      "actorLineColor/light",
      "signalColor (arrowhead)/light",
      "activationBorderColor/light",
      "actorLineColor/dark",
      "signalColor (arrowhead)/dark",
      "activationBorderColor/dark",
    ]);
    expect(pairs.every((p) => p.kind === "border" && p.advisory)).toBe(true);
    // Material draws Mermaid's default theme in both schemes, so the default
    // arrowhead is near invisible on the dark page.
    expect(find(pairs, "signalColor (arrowhead)", "dark")?.assessment.ratio).toBeLessThan(1.5);
  });

  test("themeCSS replaces Material's own CSS, so it is unauditable here too", async () => {
    const found = await checkMarkdown(
      fence('---\nconfig:\n  themeCSS: ".messageText { fill: red }"\n---\nsequenceDiagram\n  A->>B: hi'),
      "doc.md",
      { profile: "mkdocs-material" },
    );
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.UNAUDITABLE, 4]]);
  });
});
