// Style directives come from mermaid's parser result, never from the diagram
// text (MJL-0022). These cases are the ones a scan of the text got wrong:
// directive-like text inside a label, class statements, statements joined by
// semicolons, and lines mermaid drops before it parses.

import { describe, expect, test } from "bun:test";
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
