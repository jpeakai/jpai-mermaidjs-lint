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
    await expect(extractGraph("sequenceDiagram\n  A->>B: hi\n")).rejects.toThrow("not sequence");
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
    expect(included).toEqual([...STEPS.map((s) => s.slug), "presets"]);
    expect(STEPS.map((s) => s.slug)).toContain(LADDER_STEP);
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
