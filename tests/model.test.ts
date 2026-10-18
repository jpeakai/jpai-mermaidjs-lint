import { describe, expect, test } from "bun:test";
import { collectFiles } from "../src/files.ts";
import { buildDocModel, detectKeyword } from "../src/index.ts";
import { fence, tempProject } from "./helpers.ts";

describe("document model", () => {
  test("finds every mermaid fence and no other fence", () => {
    const src = `${fence("flowchart LR\n  A --> B")}\n\`\`\`js\nlet x\n\`\`\`\n\n${fence('pie\n  "a" : 1')}`;
    const doc = buildDocModel(src);
    expect(doc.diagrams.map((d) => [d.startLine, d.endLine, d.keyword])).toEqual([
      [1, 4, "flowchart"],
      [10, 13, "pie"],
    ]);
  });

  test("a standalone file is one diagram spanning the file", () => {
    const doc = buildDocModel("flowchart LR\n  A --> B\n", "diagram");
    expect(doc.diagrams).toHaveLength(1);
    expect(doc.diagrams[0]?.firstLine).toBe(1);
    expect(doc.diagrams[0]?.terminated).toBe(true);
  });

  test("a directive span maps back to its absolute offset", async () => {
    const src = `# T\n\n${fence("flowchart LR\n  classDef c fill:#ffff00,color:#fefefe")}`;
    const d = buildDocModel(src).diagrams[0];
    const span = (await d?.styles())?.directives[0]?.spans.color;
    expect(span).toBeDefined();
    const at = d?.offsetOf(span as NonNullable<typeof span>) ?? -1;
    expect(src.slice(at, at + 7)).toBe("#fefefe");
  });

  test("a line that cannot be mapped back returns null", () => {
    const d = buildDocModel(fence("flowchart LR\n  A --> B")).diagrams[0];
    expect(d?.offsetOf({ line: 99, start: 0, end: 1 })).toBeNull();
  });

  test("stats are parsed once and shared", async () => {
    const d = buildDocModel(fence("flowchart LR\n  A --> B")).diagrams[0];
    const [a, b] = await Promise.all([d?.stats(), d?.stats()]);
    expect(a).toBe(b);
    expect(a?.nodes).toBe(2);
    expect(a?.edges).toBe(1);
  });
});

describe("value offsets, from micromark's codeFlowValue tokens", () => {
  test("a span in a quoted or listed fence maps from its line's codeFlowValue token", async () => {
    const body = "flowchart LR\n  classDef c fill:#ffff00,color:#fefefe";
    const quoted = `# T\n\n${fence(body)
      .split("\n")
      .map((l) => (l ? `> ${l}` : l))
      .join("\n")}`;
    const listed = `- item\n\n${fence(body)
      .split("\n")
      .map((l) => (l ? `  ${l}` : l))
      .join("\n")}`;
    for (const src of [quoted, listed]) {
      const d = buildDocModel(src).diagrams[0];
      const span = (await d?.styles())?.directives[0]?.spans.color;
      const at = span ? (d?.offsetOf(span) ?? -1) : -1;
      expect(src.slice(at, at + 7)).toBe("#fefefe");
    }
  });

  test("a blank line holds no codeFlowValue token, so nothing on it maps", () => {
    const d = buildDocModel(fence("flowchart LR\n\n  A --> B")).diagrams[0];
    expect(d?.offsetOf({ line: 2, start: 0, end: 0 })).toBeNull();
    expect(d?.offsetOf({ line: 3, start: 2, end: 3 })).toBe("```mermaid\nflowchart LR\n\n  ".length);
  });
});

describe("detectKeyword, from mermaid's own detection", () => {
  test("looks past frontmatter, a multi-line directive and comments", () => {
    expect(detectKeyword("---\ntitle: x\n---\n%% note\nsequenceDiagram\n")).toBe("sequenceDiagram");
    expect(detectKeyword("%%{\n  init: { 'theme': 'dark' }\n}%%\nsequenceDiagram\n  A->>B: hi")).toBe(
      "sequenceDiagram",
    );
    expect(detectKeyword("---\ntitle: T\n---\nerDiagram")).toBe("erDiagram");
    expect(detectKeyword("architecture-beta\n  service a(db)[A]")).toBe("architecture");
    expect(detectKeyword("zenuml\n  Alice->Bob: hi")).toBe("zenuml");
    expect(detectKeyword("")).toBeNull();
    expect(detectKeyword("nope\n  A --> B")).toBeNull();
  });

  test("names a type declared two ways by one keyword", () => {
    expect(detectKeyword("graph TD\n  A --> B")).toBe("flowchart");
    expect(detectKeyword("flowchart LR\n  A --> B")).toBe("flowchart");
    expect(detectKeyword("flowchart-elk LR\n  A --> B")).toBe("flowchart-elk");
    expect(detectKeyword("classDiagram-v2\n  class A")).toBe("classDiagram");
    expect(detectKeyword("stateDiagram-v2\n  [*] --> A")).toBe("stateDiagram");
    expect(detectKeyword("C4Context\n  Person(a, A)")).toBe("c4");
  });
});

describe("fences, from micromark's events", () => {
  const first = (src: string) => buildDocModel(src).diagrams[0];

  test.each([
    ["a closed fence", "```mermaid\ngraph TD\nA\n```\n", true, "```"],
    ["an unclosed fence", "```mermaid\ngraph TD\nA\n", false, "```"],
    ["a closed fence in a quote", "> ~~~~mermaid\n> graph TD\n> ~~~~\n", true, "> ~~~~"],
    ["a fence the quote around it ends", "> ```mermaid\n> graph TD\n\nafter\n", false, "> ```"],
    ["a fence the list item around it ends", "- x\n  ```mermaid\n  graph\n- y\n", false, "  ```"],
    ["a fence in a quote in a list", "1. a\n   > ```mermaid\n   > graph\n", false, "   > ```"],
    ["an indented fence", "   ````mermaid\n   graph\n", false, "   ````"],
  ])("%s", (_, src, terminated, closingFence) => {
    expect(first(src)?.terminated).toBe(terminated);
    expect(first(src)?.closingFence).toBe(closingFence);
  });

  test("a fence that opens on a list item's marker line has no closing fence to add", () => {
    expect(first("- ```mermaid\n  graph\n")?.closingFence).toBeNull();
  });

  test("a closing fence shorter than the opening one does not close it", () => {
    expect(first("````mermaid\ngraph TD\n```\n")?.terminated).toBe(false);
  });

  test("a standalone file has no fence", () => {
    expect(buildDocModel("graph TD\n  A", "diagram").diagrams[0]?.closingFence).toBeNull();
  });
});

describe("file collection", () => {
  test("walks directories, skips vendored trees, honours named files", () => {
    const root = tempProject({
      "docs/a.md": "x",
      "docs/deep/b.mmd": "x",
      "docs/c.txt": "x",
      "node_modules/pkg/d.md": "x",
      ".hidden/e.md": "x",
    });
    const walked = collectFiles([root]).files.map((f) => f.slice(root.length + 1));
    expect(walked).toEqual(["docs/a.md", "docs/deep/b.mmd"]);
    expect(collectFiles([`${root}/docs/c.txt`]).files).toHaveLength(1);
    expect(collectFiles([`${root}/nope`]).unreadable).toHaveLength(1);
  });
});
