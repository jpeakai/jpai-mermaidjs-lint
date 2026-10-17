import { describe, expect, test } from "bun:test";
import { buildDocModel, checkMarkdown, fixSource, RULE, RULES } from "../src/index.ts";
import { edgeLabelBackground, scoreMkdocs } from "../src/parse/contrast.ts";
import { calculateComplexity, configFromPreset, DEFAULT_PRESET, parseFailed } from "../src/parse/metrics.ts";
import { parserReason } from "../src/parse/stats.ts";
import { MAX_NESTING } from "../src/rules/complexity-subgraph-nesting-too-deep.ts";
import { chain, fence, rules } from "./helpers.ts";

describe("parse rules", () => {
  test("a clean diagram has no findings", async () => {
    expect(await rules(fence("flowchart LR\n  A --> B"))).toEqual([]);
  });

  test("a syntax error is unparseable, and skips the complexity rules", async () => {
    const found = await checkMarkdown(fence("flowchart LR\n  A -->"), "doc.md");
    expect(found.map((f) => f.rule)).toEqual([RULE.UNPARSEABLE]);
    expect(found[0]?.message).toContain("flowchart did not parse (parser: mermaid-core)");
    expect(found[0]?.line).toBe(1);
    expect(found[0]?.endLine).toBe(4);
  });

  test("a keyword-only diagram is not a parse failure", async () => {
    expect(await rules(fence("info"))).toEqual([]);
  });

  test("an unclosed fence is reported at its opening line", async () => {
    const found = await checkMarkdown("text\n\n```mermaid\nflowchart LR\n  A --> B\n", "doc.md");
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.FENCE_UNTERMINATED, 3]]);
  });

  test("a langium diagram type is parsed", async () => {
    expect(await rules(fence('pie title Pets\n  "Dogs" : 5\n  "Cats" : 2'))).toEqual([]);
  });

  test("frontmatter before the keyword does not hide the diagram type", async () => {
    const src = fence("---\ntitle: T\n---\nflowchart LR\n  A --> B");
    expect(await rules(src)).toEqual([]);
  });

  test("each of the core diagram types yields structure", async () => {
    const samples = [
      "sequenceDiagram\n  A->>B: hi",
      "classDiagram\n  class A\n  A <|-- B",
      "stateDiagram-v2\n  [*] --> S1\n  S1 --> [*]",
      "erDiagram\n  CAR ||--o{ WHEEL : has",
      "gantt\n  title G\n  section S\n  Task :a1, 2024-01-01, 3d",
      "mindmap\n  root\n    child",
      "journey\n  title J\n  section S\n    Task: 5: Me",
      "timeline\n  title T\n  2024 : A",
      "gitGraph\n  commit\n  branch dev\n  commit",
      "architecture-beta\n  group g(cloud)[G]\n  service a(server)[A] in g",
    ];
    for (const sample of samples) expect(await rules(fence(sample))).toEqual([]);
  });
});

describe("complexity rules", () => {
  test("a diagram within every threshold is clean", async () => {
    expect(await rules(fence(chain(10)))).toEqual([]);
  });

  test("the node ladder fires exactly one rule per band", async () => {
    const flags = { preset: "low" };
    expect(await rules(fence(chain(13)), flags)).toEqual([RULE.NODES_ACCEPTABLE]);
    expect(await rules(fence(chain(21)), flags)).toContain(RULE.NODES_COGNITIVE);
    const hard = await rules(fence(chain(36)), flags);
    expect(hard).toContain(RULE.NODES_HARD);
    expect(hard).not.toContain(RULE.NODES_COGNITIVE);
    expect(hard).not.toContain(RULE.NODES_ACCEPTABLE);
  });

  test("the score ladder separates acceptable from critical", async () => {
    // 20 nodes, 19 edges: VCS 29.5. Acceptable 25 and critical 40 under low.
    expect(await rules(fence(chain(20)), { preset: "low" })).toContain(RULE.VCS_ACCEPTABLE);
    expect(await rules(fence(chain(30)), { preset: "low" })).toContain(RULE.VCS_CRITICAL);
  });

  test("a preset alias selects the same thresholds as its name", async () => {
    expect(await rules(fence(chain(13)), { preset: "strict" })).toEqual(
      await rules(fence(chain(13)), { preset: "low-density" }),
    );
  });
});

describe("complexity rules: nesting and remediation", () => {
  test("nesting three levels deep is reported", async () => {
    const src = fence(
      [
        "flowchart TB",
        "  subgraph a",
        "    subgraph b",
        "      subgraph c",
        "        X --> Y",
        "      end",
        "    end",
        "  end",
      ].join("\n"),
    );
    expect(await rules(src)).toContain(RULE.NESTING);
  });

  // A tree draws no subgraphs, so its depth is not nesting: the remedy,
  // flattening subgraphs, cannot apply. Its depth still weighs on the score.
  test.each([
    ["mindmap", "mindmap\n  root\n    a\n      b\n        c\n          d"],
    ["treemap", 'treemap-beta\n  "A"\n    "B"\n      "C"\n        "D": 10'],
    ["treeView", "treeView-beta\n  A\n    B\n      C\n        D"],
  ])("a four-level %s is not nesting", async (_, source) => {
    const doc = buildDocModel(fence(source));
    const stats = await doc.diagrams[0]?.stats();
    expect(stats?.error).toBeNull();
    expect(stats?.max_subgraph_depth).toBe(0);
    expect(stats?.max_tree_depth).toBeGreaterThanOrEqual(MAX_NESTING);
    expect(await rules(fence(source))).not.toContain(RULE.NESTING);
    if (!stats) return;
    const cfg = configFromPreset(DEFAULT_PRESET);
    const flat = calculateComplexity({ ...stats, max_tree_depth: 0 }, cfg).visual_complexity_score;
    expect(calculateComplexity(stats, cfg).visual_complexity_score).toBeGreaterThan(flat);
  });

  test("a finding carries the remediation and names subgraph boundaries", async () => {
    const body = `flowchart LR\n  subgraph core\n${chain(14).split("\n").slice(1).join("\n")}\n  end`;
    const found = await checkMarkdown(fence(body), "doc.md", { preset: "low" });
    const hit = found.find((f) => f.rule === RULE.NODES_ACCEPTABLE);
    expect(hit?.remediation).toContain("core");
  });
});

describe("contrast rules", () => {
  const withClass = (props: string): string => fence(`flowchart LR\n  A --> B\n  classDef c ${props}\n  class A c`);

  test("passing text and border pairs are clean", async () => {
    expect(await rules(withClass("fill:#ffffff,color:#000000,stroke:#000000"))).toEqual([]);
  });

  test("light text on a light fill fails, at the directive line", async () => {
    const found = await checkMarkdown(withClass("fill:#ffff00,color:#fefefe"), "doc.md");
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.TEXT, 4]]);
  });

  test("a faint border fails against its fill", async () => {
    expect(await rules(withClass("fill:#ffffff,color:#000000,stroke:#fefefe"))).toEqual([RULE.BORDER]);
  });

  test("a fill with no color is unauditable under github", async () => {
    expect(await rules(withClass("fill:#123456"))).toEqual([RULE.UNAUDITABLE]);
  });

  test("an unparseable colour is unauditable", async () => {
    expect(await rules(withClass("fill:notacolour,color:#000"))).toEqual([RULE.UNAUDITABLE]);
  });

  test("a fully transparent fill declares no box", async () => {
    expect(await rules(withClass("fill:#00000000,color:#000000"))).toEqual([]);
  });

  test("a translucent fill is scored on both canvases and the worse one gates", async () => {
    const found = await checkMarkdown(withClass("fill:#1d4ed836,color:#1d4ed8"), "doc.md");
    expect(found.every((f) => f.rule === RULE.TEXT)).toBe(true);
    expect(found.length).toBeGreaterThan(0);
  });

  test("the mkdocs-material profile ignores color and scores the host text", async () => {
    const src = withClass("fill:#1d4ed836,color:#fefefe");
    expect(await rules(src, { profile: "mkdocs-material" })).toEqual([]);
    expect(await rules(withClass("fill:#ffff00"), { profile: "mkdocs-material" })).toContain(RULE.TEXT);
  });

  test("an erDiagram is scored against both attribute rows", async () => {
    const src = fence("erDiagram\n  CAR ||--o{ WHEEL : has\n  classDef c fill:#ffffff,color:#ffffff\n  class CAR c");
    expect(await rules(src)).toContain(RULE.TEXT);
  });

  test("a style directive is scored like a classDef", async () => {
    const src = fence("flowchart LR\n  A --> B\n  style A fill:#ffff00,color:#fefefe");
    expect(await rules(src)).toEqual([RULE.TEXT]);
  });

  test("inline class applications are not scored", async () => {
    expect(await rules(fence("flowchart LR\n  A[Start]:::x --> B"))).toEqual([]);
  });
});

describe("edge label contrast", () => {
  const withLink = (props: string): string => fence(`flowchart LR\n  A -- label --> B\n  linkStyle 0 ${props}`);

  test("white edge label text fails on the light label box", async () => {
    const found = await checkMarkdown(withLink("color:#ffffff,stroke:#ffffff"), "doc.md", { profile: "github" });
    expect(found.map((f) => [f.rule, f.line])).toEqual([[RULE.TEXT, 4]]);
    expect(found[0]?.message).toBe("linkStyle 0: text 1.23:1 < 4.5 (#ffffff on #e8e8e8, light)");
    expect(found[0]?.remediation).toContain("drop color:");
  });

  test("dark edge label text reads in light but fails on the dark label box", async () => {
    const found = await checkMarkdown(withLink("color:#000000"), "doc.md", { profile: "github" });
    expect(found.map((f) => f.message)).toEqual(["linkStyle 0: text 2.95:1 < 4.5 (#000000 on #585858, dark)"]);
  });

  test("the label box is Mermaid's edgeLabelBackground stacked on each GitHub canvas", () => {
    expect([edgeLabelBackground("light"), edgeLabelBackground("dark")]).toEqual(["#e8e8e8", "#585858"]);
  });

  test("a linkStyle with no color: has no label pair", async () => {
    expect(await rules(withLink("stroke:#ff0000,stroke-width:2px"), { profile: "github" })).toEqual([]);
  });

  test("an unparseable edge label colour is unauditable", async () => {
    expect(await rules(withLink("color:notacolour"), { profile: "github" })).toEqual([RULE.UNAUDITABLE]);
  });

  test("mkdocs-material forces edge label text, so color: is not scored", async () => {
    expect(await rules(withLink("color:#ffffff"), { profile: "mkdocs-material" })).toEqual([]);
    const { skipped } = scoreMkdocs([
      { kind: "linkStyle", selector: "0", properties: { color: "#ffffff" }, spans: {}, line: 3 },
    ]);
    expect(skipped).toEqual([
      { selector: "0", line: 3, reason: "color: ignored, because the host theme forces edge label text" },
    ]);
  });

  test("the fixer leaves an edge label colour, since neither black nor white reads in both themes", async () => {
    const src = withLink("color:#ffffff");
    expect(await fixSource(src, "doc.md", { profile: "github" })).toBe(src);
  });
});

describe("one-line diagrams", () => {
  test("a one-line diagram with a syntax error is unparseable", async () => {
    expect(await rules(fence("graph TD; A-->; B[[["))).toContain(RULE.UNPARSEABLE);
  });

  test.each(["info", "pie title Pets", "graph TD; A-->B", "sequenceDiagram"])("%s on one line parses", async (src) => {
    expect(await rules(fence(src))).not.toContain(RULE.UNPARSEABLE);
  });

  test("the message carries the parser's whole reason on one line, and never says multi-line", async () => {
    const [hit] = await checkMarkdown(fence("graph TD; A-->; B[[["), "doc.md");
    expect(hit?.message).not.toContain("multi-line");
    expect(hit?.message).not.toContain("\n");
    expect(hit?.message).toContain("Parse error on line 1:");
    expect(hit?.message).toContain("got 'SEMI'");
    expect(hit?.message).toContain("its line numbers count within the diagram, not the file");
  });
});

describe("zero-node diagrams", () => {
  test.each(["pie\n  title Pets", "info\n  showInfo"])("%j parses with no nodes and is not reported", async (src) => {
    expect(await rules(fence(src))).toEqual([]);
  });

  test("a langium type the grammar rejects carries the langium reason", async () => {
    const [hit] = await checkMarkdown(fence('pie\n  "Dogs" : many'), "doc.md");
    expect(hit?.rule).toBe(RULE.UNPARSEABLE);
    expect(hit?.message).toContain("pie did not parse (parser: langium)");
    expect(hit?.message).toContain("Parsing failed");
  });

  test("mermaid core reading several lines as zero nodes is still a silent failure", async () => {
    // A mermaid-core result with no error and no nodes, from more than one line.
    const stats = {
      nodes: 0,
      edges: 0,
      subgraphs: 0,
      max_subgraph_depth: 0,
      max_tree_depth: 0,
      node_ids: [],
      subgraph_names: [],
      parser_used: "mermaid-core" as const,
      diagram_type: "flowchart",
      error: null,
    };
    expect(parseFailed("flowchart LR\n  %% nothing\n  style A fill:#fff", stats)).toBe(true);
    expect(parseFailed("flowchart LR", stats)).toBe(false);
    expect(parseFailed("pie\n  title Pets", { ...stats, parser_used: "langium" })).toBe(false);
  });

  test("zenuml says why it cannot be checked", async () => {
    const [hit] = await checkMarkdown(fence("zenuml\n  Alice->Bob: hi"), "doc.md");
    expect(hit?.rule).toBe(RULE.UNPARSEABLE);
    expect(hit?.message).toContain("external mermaid add-on that mermaidjs-lint does not include");
    expect(hit?.remediation).toContain("No fixer can help");
  });

  test("a parser reason drops the echoed source and its pointer, and keeps the rest", () => {
    const err = new Error("Parse error on line 3:\n...A --> B  C[[[\n------^\nExpecting 'TEXT', got 'SQS'");
    expect(parserReason(err)).toBe("Parse error on line 3: Expecting 'TEXT', got 'SQS'");
    expect(parserReason(new Error("No diagram type detected for text: nope\n  lots\n  of source"))).toBe(
      "No diagram type detected for text: nope",
    );
    expect(parserReason("  plain  reason \n")).toBe("plain reason");
  });
});

describe("rule wording", () => {
  test("the score rule names the complex threshold it compares against", async () => {
    const found = await checkMarkdown(fence(chain(30)), "doc.md", { preset: "low" });
    const hit = found.find((f) => f.rule === RULE.VCS_CRITICAL);
    expect(hit?.message).toMatch(/^VCS [\d.]+ > 40 complex threshold$/);
    const rule = RULES.find((r) => r.id === RULE.VCS_CRITICAL);
    expect(rule?.summary).toContain("complex threshold");
  });

  test("the hard-limit summary names the preset's hard limit", () => {
    expect(RULES.find((r) => r.id === RULE.NODES_HARD)?.summary).toBe("more nodes than the preset's hard limit");
  });

  test("the parse summary does not limit itself to multi-line diagrams", () => {
    expect(RULES.find((r) => r.id === RULE.UNPARSEABLE)?.summary).not.toContain("multi-line");
  });
});
