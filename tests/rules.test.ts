import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { buildDocModel, checkMarkdown, fixSource, RULE, RULES, splitOutcome } from "../src/index.ts";
import { edgeLabelBackground, scoreMkdocs } from "../src/parse/contrast.ts";
import { calculateComplexity, configFromPreset, DEFAULT_PRESET, parseFailed } from "../src/parse/metrics.ts";
import { extractStats, parserError } from "../src/parse/stats.ts";
import { MAX_NESTING } from "../src/rules/complexity-subgraph-nesting-too-deep.ts";
import { splitOutcomeOf, splitSentence } from "../src/rules/shared.ts";
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

  test("each row weighs on the score, and rowWeight sets how much", async () => {
    const attrs = Array.from({ length: 8 }, (_, i) => `    string a${i}`).join("\n");
    const stats = await buildDocModel(
      fence(`erDiagram\n  CUSTOMER {\n${attrs}\n  }\n  CUSTOMER ||--o{ ORDER : places`),
    ).diagrams[0]?.stats();
    if (!stats) throw new Error("no stats");
    const cfg = configFromPreset(DEFAULT_PRESET);
    // 2 entities + 0.5 × 1 relationship + 0.25 × 8 rows.
    expect(calculateComplexity(stats, cfg).visual_complexity_score).toBe(4.5);
    expect(calculateComplexity(stats, { ...cfg, row_weight: 0 }).visual_complexity_score).toBe(2.5);
  });

  test("a finding carries the remediation and names subgraph boundaries", async () => {
    const body = `flowchart LR\n  subgraph core\n${chain(14).split("\n").slice(1).join("\n")}\n  end`;
    const found = await checkMarkdown(fence(body), "doc.md", { preset: "low" });
    const hit = found.find((f) => f.rule === RULE.NODES_ACCEPTABLE);
    expect(hit?.remediation).toContain("core");
  });
});

describe("complexity rules: split plan in the remediation", () => {
  const BANDS = "tests/fixtures/complexity/bands.md";

  // The fixture quotes section 10's remediation, so its prose is checked
  // against the finding word for word.
  test("a plan that meets the contract ends the remediation, as bands.md quotes it", async () => {
    const src = await readFile(BANDS, "utf8");
    const start = src.indexOf("## 10.");
    const quoted = src.slice(start).match(/```text\n(.+)\n```/)?.[1];
    const sectionLine = src.slice(0, start).split("\n").length;
    const found = await checkMarkdown(src, BANDS);
    const ten = found.find((f) => f.line > sectionLine && f.rule === RULE.NODES_COGNITIVE);
    expect(quoted).toStartWith("Split into sub-diagrams along existing subgraph boundaries");
    expect(ten?.remediation).toBe(quoted as string);
    expect(ten?.remediation).toContain(
      " Split plan: an overview folding 4 groups (Data (13 nodes), Ingress (13 nodes)",
    );
  });

  test("with no plan the remediation keeps today's text", async () => {
    const loose = Array.from({ length: 51 }, (_, i) => `  n${i}`).join("\n");
    const found = await checkMarkdown(fence(`flowchart LR\n${loose}`), "doc.md");
    expect(found.find((f) => f.rule === RULE.NODES_COGNITIVE)?.remediation).toBe(
      "Split into sub-diagrams after grouping related nodes into subgraphs. " +
        "Target at most 25 nodes and 40 VCS per sub-diagram.",
    );
  });

  test("the plan and the graph are worked out once per diagram and thresholds", async () => {
    const diagram = buildDocModel(fence(chain(40))).diagrams[0];
    if (!diagram) throw new Error("no diagram");
    const config = configFromPreset(DEFAULT_PRESET);
    expect(splitOutcomeOf(diagram, config)).toBe(splitOutcomeOf(diagram, { ...config }));
    expect(splitOutcomeOf(diagram, config)).not.toBe(splitOutcomeOf(diagram, configFromPreset("low-density")));
    expect(diagram.graph()).toBe(diagram.graph());
    expect((await diagram.graph()).nodes).toHaveLength(40);
  });

  test("a sentence names at most four groups and counts the rest", async () => {
    const outcome = await splitOutcome(chain(200), configFromPreset(DEFAULT_PRESET));
    const plan = outcome.plan;
    if (!plan) throw new Error(`no plan: ${outcome.reason}`);
    const sentence = splitSentence(plan);
    expect(sentence).toStartWith(` Split plan: an overview folding ${plan.groups.length} groups (`);
    expect(sentence).toEndWith("), and one detail diagram per group.");
    if (plan.groups.length > 4) expect(sentence).toContain(`+${plan.groups.length - 4} more`);
    expect(sentence.match(/ nodes\)/g)?.length).toBe(Math.min(4, plan.groups.length));
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

  // Mermaid core reads each of these without an error into no nodes, so each
  // parsed: frontmatter and a directive are config, not diagram source.
  test.each([
    "sequenceDiagram",
    "---\ntitle: Empty\n---\nsequenceDiagram",
    "%%{\n init: {}\n}%%\nsequenceDiagram",
    "---\ntitle: T\n---\nerDiagram",
  ])("%j parses with no nodes and no parser error, so it did not fail", async (src) => {
    const stats = await extractStats(src);
    expect(stats.nodes).toBe(0);
    expect(stats.error).toBeNull();
    expect(parseFailed(stats)).toBe(false);
    expect(await rules(fence(src))).toEqual([]);
  });

  test("a parser error is a failure, and no type mermaid detects is one too", async () => {
    expect(parseFailed(await extractStats("flowchart LR\n  A -->"))).toBe(true);
    const unknown = await extractStats("nope\n  A --> B");
    expect(unknown.diagram_type).toBe("unknown");
    expect(parseFailed(unknown)).toBe(true);
    const [hit] = await checkMarkdown(fence("nope\n  A --> B"), "doc.md");
    expect(hit?.message).toBe(
      "a diagram of no type mermaid detects did not parse (parser: mermaid-core): No diagram type detected matching given configuration for text: nope",
    );
  });

  test("zenuml says why it cannot be checked", async () => {
    const [hit] = await checkMarkdown(fence("zenuml\n  Alice->Bob: hi"), "doc.md");
    expect(hit?.rule).toBe(RULE.UNPARSEABLE);
    expect(hit?.message).toContain("external mermaid add-on that mermaidjs-lint does not include");
    expect(hit?.remediation).toContain("No fixer can help");
  });
});

describe("parser reasons, from the fields each parser attaches", () => {
  test("a JISON parse error is read from its hash: the line, what it expected and what it got", async () => {
    const stats = await extractStats("erDiagram\n  A ||--o{ B\n");
    expect(stats.error).toBe("Parse error on line 2: Expecting 'COLON', 'STYLE_SEPARATOR', got 'NEWLINE'");
    expect(stats.error_line).toBe(2);
  });

  test("a JISON lexical error is read from its hash", async () => {
    const stats = await extractStats("graph TD\n  A --> B\n  B -->|x| \u0001");
    expect(stats.error).toBe("Lexical error on line 3: Unrecognized text");
    expect(stats.error_line).toBe(3);
  });

  test("a Langium error is read from its lexer and parser errors", async () => {
    const lexer = await extractStats("pie\n  bogus bogus");
    expect(lexer.error).toBe(
      "Parsing failed: Lexer error on line 2, column 3: unexpected character: ->b<- at offset: 6, skipped 5 characters. " +
        "Lexer error on line 2, column 9: unexpected character: ->b<- at offset: 12, skipped 5 characters.",
    );
    expect(lexer.error_line).toBe(2);
    const parser = await extractStats("gitGraph\n  commit id: 1\n");
    expect(parser.error).toBe(
      "Parsing failed: Parse error on line 2, column 14: Expecting token of type 'STRING' but found `1`.",
    );
    // An error at the end of the diagram names no line.
    const end = await extractStats('pie\n  "a" : x');
    expect(end.error).toContain("Parse error at the end of the diagram: Expecting token of type 'NUMBER_PIE'");
  });

  test("any other error keeps its first line, and points at no line", () => {
    expect(parserError(new Error("No diagram type detected for text: nope\n  lots\n  of source"))).toEqual({
      reason: "No diagram type detected for text: nope",
      line: null,
    });
    expect(parserError("  plain  reason \n")).toEqual({ reason: "plain  reason", line: null });
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
