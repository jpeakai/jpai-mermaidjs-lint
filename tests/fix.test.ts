import { describe, expect, test } from "bun:test";
import { describeError } from "../src/cli.ts";
import { checkMarkdown, FixNotConvergingError, fixSource, fixSourceReport, RULE } from "../src/index.ts";
import { fixRule, localPlugin } from "../src/testing.ts";
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
});

describe("contrast fixer, wherever the diagram sits", () => {
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
});

describe("contrast fixer, when it must not act", () => {
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

  test("closes a fence inside a quote with the quote's marker", async () => {
    const src = "> ```mermaid\n> flowchart LR\n>   A --> B\n";
    const out = await fixSource(src, "doc.md");
    expect(out).toBe(`${src}> \`\`\`\n`);
    expect(await checkMarkdown(out, "doc.md")).toEqual([]);
  });

  test("closes a long fence with its own length", async () => {
    const src = "````mermaid\nflowchart LR\n  A --> B\n";
    expect(await fixSource(src, "doc.md")).toBe(`${src}\`\`\`\`\n`);
  });

  test("refuses a fence that opens on a list item's marker line", async () => {
    const src = "- ```mermaid\n  flowchart LR\n    A --> B\n";
    expect(await fixSource(src, "doc.md")).toBe(src);
  });

  test("a fixed document is stable", async () => {
    const src = "```mermaid\nflowchart LR\n  A --> B\n";
    const once = await fixSource(src, "doc.md");
    expect(await fixSource(once, "doc.md")).toBe(once);
  });
});

// A plugin rule whose fixer proposes one fixed edit, held to the real engine.
const rewriter = (
  edit: (src: string) => { start: number; end: number; text: string },
  kind: "same-tree" | "same-diagrams",
) =>
  localPlugin("diagram-rewrite", {
    default: {
      category: "diagram",
      summary: "rewrites",
      check: () => [],
      fix: ({ doc }: { doc: { src: string } }) => {
        const e = edit(doc.src);
        return doc.src.slice(e.start, e.end) === e.text ? [] : [{ ...e, expect: { kind } }];
      },
    },
    categories: { diagram: "d" },
  });

describe("same-tree on a raw diagram file", () => {
  const RAW = "flowchart LR\n  A --> B\n";

  for (const file of ["d.mmd", "d.mermaid"]) {
    test(`${file}: a fixer that replaces the whole diagram is refused`, async () => {
      const plugin = rewriter((src) => ({ start: 0, end: src.length, text: "pie\n  title gone\n" }), "same-tree");
      const out = await fixRule(plugin, "diagram-rewrite", RAW, { file });
      expect(out.output).toBe(RAW);
      expect(out.applied).toEqual([]);
      expect(out.refused).toHaveLength(1);
    });

    test(`${file}: an edit that keeps the diagram's structure is applied`, async () => {
      const plugin = rewriter(
        (src) => ({ start: src.indexOf(" --> "), end: src.indexOf(" --> ") + 5, text: "-->" }),
        "same-tree",
      );
      const out = await fixRule(plugin, "diagram-rewrite", RAW, { file });
      expect(out.output).toBe("flowchart LR\n  A-->B\n");
    });
  }

  test("a markdown file is still judged by its tree", async () => {
    const src = `# Title\n\n${fence("flowchart LR\n  A --> B")}`;
    const plugin = rewriter(
      (s) => ({ start: s.indexOf("Title"), end: s.indexOf("Title") + 5, text: "Heading" }),
      "same-tree",
    );
    expect((await fixRule(plugin, "diagram-rewrite", src)).refused).toHaveLength(1);
  });
});

// `pie title Pets` parses to zero nodes, so a fixer that appends junk keeps
// every count the same. Only the parse result tells the edit broke it.
describe("an edit that breaks a diagram's parse", () => {
  const PIE = "pie title Pets\n";
  const breaker = (kind: "same-tree" | "same-diagrams") =>
    rewriter((src) => {
      const at = src.indexOf(PIE) + PIE.length;
      return { start: at, end: at, text: "this is not pie syntax !!!\n" };
    }, kind);

  test("same-diagrams: refused in a markdown file", async () => {
    const src = fence(PIE.trimEnd());
    const out = await fixRule(breaker("same-diagrams"), "diagram-rewrite", src, { file: "doc.md" });
    expect(out.output).toBe(src);
    expect(out.applied).toEqual([]);
    expect(out.refused).toHaveLength(1);
    expect(await checkMarkdown(out.output, "doc.md")).toEqual([]);
  });

  for (const kind of ["same-tree", "same-diagrams"] as const) {
    test(`${kind}: refused in a raw diagram file`, async () => {
      const out = await fixRule(breaker(kind), "diagram-rewrite", PIE, { file: "d.mmd" });
      expect(out.output).toBe(PIE);
      expect(out.refused).toHaveLength(1);
    });
  }

  test("same-diagrams: a harmless edit to the same diagram is still applied", async () => {
    const src = fence(PIE.trimEnd());
    const plugin = rewriter((s) => {
      const at = s.indexOf("Pets");
      return { start: at, end: at + 4, text: "Cats" };
    }, "same-diagrams");
    const out = await fixRule(plugin, "diagram-rewrite", src, { file: "doc.md" });
    expect(out.applied).toHaveLength(1);
    expect(out.output).toContain("pie title Cats");
  });
});

describe("a fixer that never converges", () => {
  test("stops with fix-not-converging, naming the rule still proposing edits", async () => {
    // Every pass adds one more comment line, which verifies, so there is never a fixpoint.
    const plugin = localPlugin("diagram-forever", {
      default: {
        category: "diagram",
        summary: "never done",
        check: () => [],
        fix: ({ doc }: { doc: { src: string } }) => {
          const at = doc.src.indexOf("  A --> B");
          return [{ start: at, end: at, text: "  %% ok\n", expect: { kind: "same-diagrams" as const } }];
        },
      },
      categories: { diagram: "d" },
    });
    const run = fixRule(plugin, "diagram-forever", fence("flowchart LR\n  A --> B"), { file: "doc.md" });
    const err = await run.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FixNotConvergingError);
    const named = err as FixNotConvergingError;
    expect(named.code).toBe("fix-not-converging");
    expect(named.rules).toEqual(["local/diagram-forever"]);
    expect(describeError(named)).toStartWith("error[fix-not-converging]: doc.md: --fix did not converge");
    expect(describeError(named)).toContain("local/diagram-forever kept proposing edits");
  }, 60_000);
});
