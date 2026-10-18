// Style directives come from mermaid's parser result, never from the diagram
// text (MJL-0022). These cases are the ones a scan of the text got wrong:
// directive-like text inside a label, class statements, statements joined by
// semicolons, and lines mermaid drops before it parses.

import { describe, expect, test } from "bun:test";
import Color from "colorjs.io";
import { checkMarkdown, fixSource, RULE } from "../src/index.ts";
import { compositeOver } from "../src/parse/color.ts";
import { scoreSequence } from "../src/parse/contrast.ts";
import { readStyles, sourceLines } from "../src/parse/styles.ts";
import { fence } from "./helpers.ts";

const selectors = async (source: string): Promise<string[]> =>
  (await readStyles(source)).directives.map((d) => `${d.kind} ${d.selector}`);

describe("labels that hold directive-like text", () => {
  test("a style line inside a quoted two-line label is label text, not a directive", async () => {
    const src = 'flowchart LR\n  A["first line\nstyle B fill:#fff,color:#fff"] --> B\n';
    expect(await selectors(src)).toEqual([]);
    expect(await checkMarkdown(fence(src), "doc.md", { profile: "github" })).toEqual([]);
  });

  test("a classDef and a linkStyle inside labels are not read", async () => {
    const src = 'flowchart LR\n  A["classDef x fill:#000,color:#000"] -->|"linkStyle 0 color:#fff"| B\n';
    expect(await selectors(src)).toEqual([]);
  });

  test("the real statements beside such a label are still read, at their own lines", async () => {
    const src = 'flowchart LR\n  A["x\nstyle B fill:#fff"] --> B\n  classDef c fill:#ffff00,color:#fefefe\n';
    const { directives } = await readStyles(src);
    expect(directives.map((d) => [d.selector, d.line])).toEqual([["c", 4]]);
  });
});

describe("class statements", () => {
  test("`class A,B warm` gives each node its class, under a node's own style", async () => {
    const src = [
      "flowchart LR",
      "  A --> B",
      "  classDef warm fill:#ffffff,color:#000000",
      "  class A,B warm",
      "  style B color:#eeeeee",
    ].join("\n");
    const { directives } = await readStyles(src);
    const b = directives.find((d) => d.selector === "B");
    expect(b?.properties).toMatchObject({ fill: "#ffffff", color: "#eeeeee" });
    // Only the value B's own statement wrote is B's to rewrite.
    expect(Object.keys(b?.spans ?? {})).toEqual(["color"]);
    const found = await checkMarkdown(fence(src), "doc.md", { profile: "github" });
    expect(found.map((f) => f.message.split(":")[0])).toEqual(["style B"]);
  });

  test("a fix rewrites the node's own colour, never the class it inherits from", async () => {
    const src = fence(
      ["flowchart LR", "  A --> B", "  classDef warm fill:#ffff00", "  class A,B warm", "  style B color:#fefefe"].join(
        "\n",
      ),
    );
    const fixed = await fixSource(src, "doc.md", { profile: "github" });
    expect(fixed).toContain("style B color:#000000");
    expect(fixed).toContain("classDef warm fill:#ffff00");
  });

  test("a classDef shared by two ids is fixed once", async () => {
    const src = fence("flowchart LR\n  A --> B\n  classDef a,b fill:#ffff00,color:#fefefe");
    expect(await fixSource(src, "doc.md", { profile: "github" })).toBe(
      fence("flowchart LR\n  A --> B\n  classDef a,b fill:#ffff00,color:#000000"),
    );
  });

  test("a state's class and its own style are read from the state DB", async () => {
    const src =
      "stateDiagram-v2\n  classDef bad fill:#ffffff,color:#000000\n  [*] --> A\n  class A bad\n  style A color:#eeeeee\n";
    const a = (await readStyles(src)).directives.find((d) => d.kind === "style");
    expect(a?.properties).toMatchObject({ fill: "#ffffff", color: "#eeeeee" });
    expect(a?.line).toBe(5);
  });
});

describe("statements mermaid reads that a line scan did not", () => {
  test("a style joined to other statements by a semicolon is read", async () => {
    const src = "graph TD; A-->B; style A fill:#ffff00,color:#fefefe";
    expect(await selectors(src)).toEqual(["style A"]);
    const found = await checkMarkdown(fence(src), "doc.md", { profile: "github" });
    expect(found.map((f) => f.rule)).toEqual([RULE.TEXT]);
  });

  test("findings keep their lines past frontmatter, comments and folded blank lines", async () => {
    const src = [
      "---",
      "config:",
      "  look: classic",
      "---",
      "%% a comment",
      "flowchart LR",
      '  A{"a decision"}',
      "",
      "",
      "  %% another",
      "  classDef c fill:#ffff00,color:#fefefe",
    ].join("\n");
    const found = await checkMarkdown(fence(src), "doc.md", { profile: "github" });
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.TEXT, 12]]);
  });

  test("a style in a diagram type the audit does not model fails to audit", async () => {
    const src = "block-beta\n  columns 2\n  a b\n  style b fill:#0000ff,color:#000000\n";
    const found = await checkMarkdown(fence(src), "doc.md", { profile: "github" });
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.UNAUDITABLE, 5]]);
  });
});

describe("placing a parsed line in the source", () => {
  // The frontmatter's block scalar holds the same text as the diagram body, so
  // a text match placed the style statement inside the title.
  const titled = [
    "---",
    "title: |",
    "  flowchart TD",
    "  style A fill:#777,color:#888",
    "---",
    "flowchart TD",
    "  style A fill:#777,color:#888",
  ].join("\n");

  test("a statement is never placed inside the frontmatter that repeats its text", async () => {
    const found = await checkMarkdown(fence(titled), "doc.md", { profile: "github" });
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.TEXT, 8]]);
  });

  test("a fix rewrites the diagram body and leaves the frontmatter title alone", async () => {
    const fixed = await fixSource(fence(titled), "doc.md", { profile: "github" });
    expect(fixed).toBe(fence(titled.replace(/color:#888$/, "color:#000000")));
  });

  test("an edited line between dropped lines is placed by the text past its keyword", () => {
    const source = "flowchart LR\n  %% x\n  %% y\n  style A fill:#fff;\n  A --> B";
    const parsed = "flowchart LR\n  style A fill:#fff\n  A --> B\n";
    expect(sourceLines(source, parsed)(2, 7)).toBe(4);
  });

  test("an edited line that two source lines could be is not placed", () => {
    const source = "flowchart LR\n  %% x\n  style A fill:#fff;\n  style A fill:#fff;;\n  A --> B";
    const parsed = "flowchart LR\n  style A fill:#fff\n  A --> B\n";
    expect(sourceLines(source, parsed)(2, 7)).toBeNull();
  });

  test("a parsed line that either of two body lines could be is not placed", () => {
    const place = sourceLines(
      "flowchart LR\n  style A fill:#fff\n  %% x\n  style A fill:#fff",
      "flowchart LR\n  style A fill:#fff",
    );
    expect(place(2, 7)).toBeNull();
  });

  test("a line repeated in order is placed, each copy at its own line", () => {
    const place = sourceLines("flowchart LR\n  A\n  %% x\n  A", "flowchart LR\n  A\n  A");
    expect([place(2), place(3)]).toEqual([2, 4]);
  });
});

describe("value spans from the lexer's tokens", () => {
  const spansOf = async (source: string) => (await readStyles(source)).directives.map((d) => d.spans);

  test("a flowchart value is placed between its COLON and COMMA tokens, past the spaces", async () => {
    expect(await spansOf("flowchart TD\n  A-->B\n  style A fill:#ffff00 , color:#fefefe")).toEqual([
      { fill: { line: 3, start: 15, end: 22 }, color: { line: 3, start: 31, end: 38 } },
    ]);
  });

  test("an erDiagram value is placed from its STYLE_TEXT tokens", async () => {
    expect(await spansOf("erDiagram\n  C ||--o{ O : places\n  style C fill:#fff , color:#000")).toEqual([
      { fill: { line: 3, start: 15, end: 19 }, color: { line: 3, start: 28, end: 32 } },
    ]);
  });

  test("a value after text mermaid edited out of the line is not placed", async () => {
    // Mermaid drops the semicolon before the comma, which moves the colour
    // in the text it parses, so only the fill before it keeps its span.
    const src = "stateDiagram-v2\n  A --> B\n  classDef bad fill:#fff;,color:#000\n  class A bad";
    expect(await spansOf(src)).toEqual([{ fill: { line: 3, start: 20, end: 24 } }]);
  });

  test("a classDiagram value, which its lexer reads inside a LABEL, is never placed", async () => {
    expect(await spansOf("classDiagram\n  class A\n  style A fill:#fff,color:#000")).toEqual([{}]);
  });

  test("a value mermaid cuts at a comma inside rgb() has no span", async () => {
    const { directives } = await readStyles("classDiagram\n  class A\n  style A fill:rgb(255,255,255),color:#000");
    expect(directives[0]?.properties.fill).toBe("rgb(255");
    expect(directives[0]?.spans.fill).toBeUndefined();
  });
});

describe("stateDiagram statements read through the DB", () => {
  test("a style inside a composite state, which the DB never applies, takes no root state's span", async () => {
    const src =
      "stateDiagram-v2\n  A --> B\n  style A fill:#fff,color:#000\n  state X {\n    C\n    style A fill:#111\n  }";
    const a = (await readStyles(src)).directives.find((d) => d.selector === "A");
    expect(a?.properties).toEqual({ fill: "#fff", color: "#000" });
    expect(a?.spans).toEqual({ fill: { line: 3, start: 15, end: 19 }, color: { line: 3, start: 26, end: 30 } });
  });

  test("two identical statements are each paired with their own keyword", async () => {
    const src = "stateDiagram-v2\n  A --> B\n  style A fill:#fff\n  style B fill:#fff\n  style A fill:#fff";
    const lines = (await readStyles(src)).directives.map((d) => [d.selector, d.line, d.spans.fill?.line]);
    expect(lines).toEqual([
      ["A", 3, 5],
      ["B", 4, 4],
    ]);
  });
});

describe("sequence positions from the parsers", () => {
  test("a rect's pairs point at its line past comment lines mermaid drops", async () => {
    const found = await checkMarkdown(
      fence("sequenceDiagram\n  %% one\n  %% two\n  A->>B: hi\n  rect rgb(200, 150, 255)\n    A->>B: inside\n  end"),
      "doc.md",
      { profile: "github" },
    );
    expect(found.map((f) => f.line)).toEqual([6, 6]);
  });

  test("a theme variable's line is read from the frontmatter by yaml", async () => {
    const src =
      "---\nconfig:\n  themeVariables:\n    # signalTextColor: no\n    signalTextColor: '#475569'\n---\nsequenceDiagram\n  A->>B: hi";
    const { pairs } = await scoreSequence(src, "github");
    expect(pairs.find((p) => p.selector === "signalTextColor")?.line).toBe(5);
  });
});

describe("colour serialisation by colorjs.io", () => {
  test("a composite is six-digit hex, with alpha only when translucent", () => {
    expect(compositeOver("#ffffff", "#000000")).toBe("#ffffff");
    expect(compositeOver("#ff000080", "#0000ff")).toBe("#80007f");
    expect(compositeOver("#ff000080", "transparent")).toBe("#ff000080");
  });

  test("an out-of-gamut channel is clipped, as an sRGB page paints it", () => {
    expect(compositeOver("color(display-p3 1 0 0)", "#ffffff")).toBe("#ff0000");
  });
});

describe("compositeOver, a colorjs.io mix, against alpha-over", () => {
  // Alpha-over written out as the reference the colorjs.io mix must equal:
  // each channel fa*f + ba*(1-fa)*b over the composite alpha, then clipped.
  const alphaOver = (fg: string, bg: string): string => {
    const f = new Color(fg).to("srgb");
    const b = new Color(bg).to("srgb");
    const fa = f.alpha ?? 1;
    const ba = b.alpha ?? 1;
    const outA = fa + ba * (1 - fa);
    const ch = (i: number): number =>
      outA === 0 ? 0 : (fa * (f.coords[i] ?? 0) + ba * (1 - fa) * (b.coords[i] ?? 0)) / outA;
    return new Color("srgb", [ch(0), ch(1), ch(2)], outA)
      .toGamut({ method: "clip" })
      .toString({ format: "hex", collapse: false });
  };
  const channels = [0, 0x1f, 0x55, 0x80, 0xaa, 0xd4, 0xff].map((n) => n.toString(16).padStart(2, "0"));
  const opaque = channels.flatMap((r, i) =>
    channels.map((g, j) => `#${r}${g}${channels[(i * 3 + j) % channels.length]}`),
  );
  const outOfGamut = [
    "color(display-p3 1 0 0)",
    "color(display-p3 0 1 0)",
    "color(rec2020 0 0 1)",
    "oklch(0.9 0.4 140)",
  ];
  const backdrops = [...opaque, ...outOfGamut];

  test("an opaque colour over any backdrop, in or out of gamut, matches alpha-over", () => {
    for (const fg of [...opaque, ...outOfGamut]) {
      for (const bg of backdrops) expect(compositeOver(fg, bg)).toBe(alphaOver(fg, bg));
    }
  });

  test("a translucent colour over an opaque backdrop matches alpha-over", () => {
    for (const alpha of ["00", "19", "80", "cc", "fe"]) {
      for (const fg of opaque) {
        for (const bg of opaque) expect(compositeOver(`${fg}${alpha}`, bg)).toBe(alphaOver(`${fg}${alpha}`, bg));
      }
    }
  });

  test("a translucent colour over a translucent backdrop matches alpha-over", () => {
    for (const fg of opaque) {
      for (const bg of opaque) expect(compositeOver(`${fg}80`, `${bg}40`)).toBe(alphaOver(`${fg}80`, `${bg}40`));
    }
    expect(compositeOver("transparent", "transparent")).toBe(alphaOver("transparent", "transparent"));
  });

  test("a translucent out-of-gamut colour is clipped before it is blended", () => {
    // p3 red's red channel is past 1 in sRGB, so blending it unclipped would
    // lighten the backdrop more than the red a page can paint.
    expect(compositeOver("color(display-p3 1 0 0 / 0.5)", "#000000")).toBe(compositeOver("#ff000080", "#000000"));
  });
});
