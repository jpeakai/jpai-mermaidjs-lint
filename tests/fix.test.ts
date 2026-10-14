import { describe, expect, test } from "bun:test";
import { checkMarkdown, fixSource, fixSourceReport, RULE } from "../src/index.ts";
import { fence } from "./helpers.ts";

const withClass = (props: string, extra = ""): string =>
  fence(`flowchart LR\n  A --> B\n  classDef c ${props}\n  class A c${extra}`);

describe("contrast fixer", () => {
  test("rewrites a failing color to black or white and stops", async () => {
    const out = await fixSource(withClass("fill:#ffff00,color:#fefefe"), "doc.md");
    expect(out).toContain("color:#000000");
    expect(await checkMarkdown(out, "doc.md")).toEqual([]);
    expect(await fixSource(out, "doc.md")).toBe(out);
  });

  test("chooses white on a dark fill", async () => {
    const out = await fixSource(withClass("fill:#000033,color:#111111"), "doc.md");
    expect(out).toContain("color:#ffffff");
  });

  test("leaves everything outside the colour untouched", async () => {
    const src = `# Title\n\nSome prose.\n\n${withClass("fill:#ffff00,color:#fefefe,stroke:#000000")}\nAfter.\n`;
    const out = await fixSource(src, "doc.md");
    expect(out).toBe(src.replace("color:#fefefe", "color:#000000"));
  });

  test("fixes a fence inside a blockquote", async () => {
    const quoted = withClass("fill:#ffff00,color:#fefefe")
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    const out = await fixSource(quoted, "doc.md");
    expect(out).toContain("> ");
    expect(out).toContain("color:#000000");
  });

  test("fixes a fence inside a list item", async () => {
    const listed = `- item\n\n${withClass("fill:#ffff00,color:#fefefe")
      .split("\n")
      .map((l) => (l ? `  ${l}` : l))
      .join("\n")}`;
    expect(await fixSource(listed, "doc.md")).toContain("color:#000000");
  });

  test("fixes a style directive", async () => {
    const src = fence("flowchart LR\n  A --> B\n  style A fill:#ffff00,color:#fefefe");
    expect(await fixSource(src, "doc.md")).toContain("color:#000000");
  });

  test("fixes a standalone .mmd file", async () => {
    const src = "flowchart LR\n  A --> B\n  classDef c fill:#ffff00,color:#fefefe\n";
    expect(await fixSource(src, "d.mmd")).toContain("color:#000000");
  });

  test("refuses to invent a colour that is not declared", async () => {
    const src = withClass("fill:#ffff00");
    const report = await fixSourceReport(src, "doc.md");
    expect(report.output).toBe(src);
    expect(report.applied).toEqual([]);
  });

  test("refuses when neither black nor white clears 4.5 on every canvas", async () => {
    // Translucent mid-blue over white reads light and over dark reads dark, and
    // a single colour cannot be right on both.
    const src = withClass("fill:#808080aa,color:#7f7f7f");
    const found = (await checkMarkdown(src, "doc.md")).filter((f) => f.rule === RULE.TEXT);
    expect(found.length).toBeGreaterThan(0);
    const out = await fixSource(src, "doc.md");
    expect(out === src || (await checkMarkdown(out, "doc.md")).every((f) => f.rule !== RULE.TEXT)).toBe(true);
  });

  test("does nothing under a host profile, where color is ignored", async () => {
    const src = withClass("fill:#ffff00,color:#fefefe");
    expect(await fixSource(src, "doc.md", { profile: "mkdocs-material" })).toBe(src);
  });

  test("does nothing for an erDiagram, whose rows differ by theme", async () => {
    const src = fence("erDiagram\n  CAR ||--o{ WHEEL : has\n  classDef c fill:#ffffff,color:#ffffff\n  class CAR c");
    const out = await fixSource(src, "doc.md");
    expect(await checkMarkdown(out, "doc.md")).toEqual(await checkMarkdown(src, "doc.md"));
  });
});

describe("fence fixer", () => {
  test("closes an unclosed fence at the end of the file", async () => {
    const src = "text\n\n```mermaid\nflowchart LR\n  A --> B";
    const out = await fixSource(src, "doc.md");
    expect(out).toBe(`${src}\n\`\`\``);
    expect(await checkMarkdown(out, "doc.md")).toEqual([]);
  });

  test("closes with the opening fence's own marker", async () => {
    const src = "~~~mermaid\nflowchart LR\n  A --> B\n";
    const out = await fixSource(src, "doc.md");
    expect(out.trimEnd().endsWith("~~~")).toBe(true);
  });

  test("closes a fence inside a list at its indentation", async () => {
    const src = "- item\n\n  ```mermaid\n  flowchart LR\n    A --> B\n";
    const out = await fixSource(src, "doc.md");
    expect(out.trimEnd().endsWith("  ```")).toBe(true);
    expect(await checkMarkdown(out, "doc.md")).toEqual([]);
  });

  test("a fixed document is stable", async () => {
    const src = "```mermaid\nflowchart LR\n  A --> B\n";
    const once = await fixSource(src, "doc.md");
    expect(await fixSource(once, "doc.md")).toBe(once);
  });
});
