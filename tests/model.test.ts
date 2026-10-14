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

  test("a directive span maps back to its absolute offset", () => {
    const src = `# T\n\n${fence("flowchart LR\n  classDef c fill:#ffff00,color:#fefefe")}`;
    const d = buildDocModel(src).diagrams[0];
    const span = d?.directives[0]?.spans.color;
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

  test("detectKeyword skips comments and frontmatter", () => {
    expect(detectKeyword("%% note\n---\ntitle: x\n---\nsequenceDiagram\n")).toBe("sequenceDiagram");
    expect(detectKeyword("")).toBeNull();
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
