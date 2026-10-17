// The element-level graph the parse engine returns, and the worked examples on
// the Measuring complexity page built from it. Each runs the real parsers, so
// the graph drawn on the page and the score worked under it cannot drift from
// what the linter measures.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  complexitySnippets,
  cytoscapeElements,
  LADDER_STEP,
  measureStep,
  num,
  STEPS,
  workedScore,
} from "../scripts/complexity-steps.ts";
import { extractGraph } from "../src/parse/graph.ts";
import { calculateComplexity, configFromPreset } from "../src/parse/metrics.ts";
import { extractStats } from "../src/parse/stats.ts";
import { PROJECT_ROOT } from "./helpers.ts";

const PAGE = readFileSync(join(PROJECT_ROOT, "docs-site", "docs", "concepts", "complexity.md"), "utf8");

describe("extractGraph", () => {
  test("keeps each element of a flowchart, with every member under its innermost subgraph", async () => {
    const graph = await extractGraph(
      "flowchart LR\n  subgraph outer [Outer]\n    subgraph inner [Inner]\n      A[Alpha] --> B\n    end\n    C --> A\n  end\n  D --> C\n",
    );
    expect(graph.diagram_type).toBe("flowchart-v2");
    expect(graph.nodes).toEqual([
      { id: "A", label: "Alpha", parent: "inner" },
      { id: "B", label: "B", parent: "inner" },
      { id: "C", label: "C", parent: "outer" },
      { id: "D", label: "D", parent: null },
    ]);
    expect(graph.edges).toEqual([
      { source: "A", target: "B" },
      { source: "C", target: "A" },
      { source: "D", target: "C" },
    ]);
    expect(graph.subgraphs).toEqual([
      { id: "inner", label: "Inner", parent: "outer" },
      { id: "outer", label: "Outer", parent: null },
    ]);
  });

  test("reads a mindmap as a tree, naming each entry by the parser's id so repeated labels stay apart", async () => {
    const graph = await extractGraph("mindmap\n  root((Root))\n    Same\n      Leaf\n    Same\n");
    expect(graph.nodes.map((n) => n.label)).toEqual(["Root", "Same", "Leaf", "Same"]);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(4);
    expect(graph.edges).toHaveLength(3);
    expect(graph.subgraphs).toEqual([]);
  });

  test("refuses a type it does not read, rather than returning an empty graph", async () => {
    await expect(extractGraph("classDiagram\n  A <|-- B\n")).rejects.toThrow("not classDiagram");
  });
});

describe("extractGraph for sequence, entity and state diagrams", () => {
  test("reads a sequence diagram's participants, messages, boxes and nested blocks", async () => {
    const graph = await extractGraph(
      "sequenceDiagram\n  box Shop\n    participant A as Alpha\n  end\n  participant B\n  loop L\n    alt ok\n      A->>B: hi\n    end\n  end\n  Note over A: n\n  B-->>A: bye",
    );
    expect(graph.nodes).toEqual([
      { id: "A", label: "Alpha", parent: "box_0" },
      { id: "B", label: "B", parent: null },
    ]);
    expect(graph.edges).toEqual([
      { source: "A", target: "B" },
      { source: "B", target: "A" },
    ]);
    expect(graph.subgraphs).toEqual([
      { id: "box_0", label: "Shop", parent: null },
      { id: "block_1", label: "L", parent: null },
      { id: "block_2", label: "ok", parent: "block_1" },
    ]);
  });

  test("reads an erDiagram's entities and relationships by entity name", async () => {
    const graph = await extractGraph("erDiagram\n  A ||--o{ B : has\n  B }|--|| C : in\n");
    expect(graph.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(graph.edges).toEqual([
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ]);
  });

  test("reads a stateDiagram without markers or notes, with a composite state inside its own box", async () => {
    const graph = await extractGraph(
      "stateDiagram-v2\n  [*] --> A\n  state A {\n    [*] --> B\n  }\n  A --> C\n  note right of C : n\n",
    );
    expect(graph.nodes).toEqual([
      { id: "A", label: "A", parent: "A__group" },
      { id: "B", label: "B", parent: "A__group" },
      { id: "C", label: "C", parent: null },
    ]);
    expect(graph.edges).toEqual([{ source: "A", target: "C" }]);
    expect(graph.subgraphs).toEqual([{ id: "A__group", label: "", parent: null }]);
  });

  for (const step of STEPS) {
    test(`counts the same elements as the stats for the ${step.slug} step`, async () => {
      const [graph, stats] = await Promise.all([extractGraph(step.source), extractStats(step.source)]);
      expect(graph.nodes.length).toBe(stats.nodes);
      expect(graph.edges.length).toBe(stats.edges);
      expect(graph.subgraphs.length).toBe(stats.subgraphs);
    });
  }
});

describe("the worked complexity steps", () => {
  test("every step's snippet is included by the page, in order, and the ladder has its preset table", () => {
    const included = [...PAGE.matchAll(/--8<-- "complexity\/([\w-]+)\.md"/g)].map((m) => m[1]);
    const slugs = STEPS.map((s) => s.slug);
    const ladder = slugs.indexOf(LADDER_STEP);
    expect(ladder).toBeGreaterThanOrEqual(0);
    // The preset table follows the ladder step's section, before the steps after it.
    expect(included).toEqual([...slugs.slice(0, ladder + 1), "presets", ...slugs.slice(ladder + 1)]);
  });

  test("the graph of each step with rows names them in its counts", async () => {
    const snippets = await complexitySnippets(join(PROJECT_ROOT, "doc.md"));
    expect(snippets["complexity/er.md"]).toContain("4 nodes, 3 edges, 0 subgraphs, 5 rows");
    expect(snippets["complexity/state.md"]).toContain("5 nodes, 3 edges, 1 subgraphs");
  });

  test("each score the page states is the score the linter computes for that step", async () => {
    const stated = [...PAGE.matchAll(/\bscores? (\d+(?:\.\d+)?)\b/g)].map((m) => m[1]);
    const computed = [];
    for (const step of STEPS) computed.push(num((await measureStep(step)).score));
    expect(stated).toEqual(computed);
  });

  test("each snippet works its sum to the computed score, and draws every parsed element", async () => {
    const snippets = await complexitySnippets(join(PROJECT_ROOT, "doc.md"));
    for (const step of STEPS) {
      const m = await measureStep(step);
      const snippet = snippets[`complexity/${step.slug}.md`] ?? "";
      expect(snippet).toContain(`      = ${num(m.score)}\n\`\`\``);
      expect(snippet).toContain(`${m.stats.nodes} nodes, ${m.stats.edges} edges, ${m.stats.subgraphs} subgraphs`);
      expect(snippet).toContain(m.stats.rows > 0 ? `× ${m.stats.rows} +` : "× edges + ");
      const graph = /data-graph="([^"]*)"/.exec(snippet)?.[1] ?? "";
      const elements = JSON.parse(graph.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
      expect(elements).toEqual(cytoscapeElements(m.graph));
    }
    expect(snippets["complexity/presets.md"]).toContain("| `high-density` | 15 |");
  });

  test("the worked sum follows the weights it is given, and still arrives at the computed score", async () => {
    const { stats } = await measureStep(STEPS[2] as (typeof STEPS)[number]);
    const config = { ...configFromPreset("high-density"), edge_weight: 1, depth_weight: 0.25 };
    const worked = workedScore(stats, config);
    expect(worked).toContain("(nodes + 1 × edges + 3 × subgraphs) × (1 + 0.25 × depth)");
    expect(worked).toEndWith(`= ${num(calculateComplexity(stats, config).visual_complexity_score)}`);
  });
});
