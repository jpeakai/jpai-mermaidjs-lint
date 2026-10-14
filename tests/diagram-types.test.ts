// Every diagram type the parse engine has an adapter for must yield structure
// from mermaid's own parser, or its complexity would be reported as zero.

import { describe, expect, test } from "bun:test";
import { buildDocModel } from "../src/index.ts";
import { indentTreeStats } from "../src/parse/stats.ts";
import { fence } from "./helpers.ts";

const SAMPLES: Record<string, string> = {
  block: "block-beta\n  columns 2\n  a b\n  a --> b",
  c4: 'C4Context\n  Person(u, "User")\n  System(s, "System")\n  Rel(u, s, "Uses")',
  kanban: "kanban\n  todo[Todo]\n    t1[Task one]\n  done[Done]\n    t2[Task two]",
  quadrant:
    "quadrantChart\n  title Q\n  x-axis Low --> High\n  y-axis Low --> High\n  quadrant-1 A\n  quadrant-2 B\n  quadrant-3 C\n  quadrant-4 D\n  P: [0.3, 0.6]",
  requirement:
    "requirementDiagram\n  requirement r {\n    id: 1\n    text: t\n    risk: low\n    verifymethod: test\n  }\n  element e {\n    type: sim\n  }\n  e - satisfies -> r",
  sankey: "sankey-beta\n\nA,B,10\nB,C,5",
  xychart: "xychart-beta\n  x-axis [a, b, c]\n  bar [1, 2, 3]",
  state: "stateDiagram-v2\n  [*] --> A\n  A --> B",
  pie: 'pie\n  "A" : 1\n  "B" : 2',
  packet: 'packet-beta\n  0-15: "Source"\n  16-31: "Dest"',
  radar: "radar-beta\n  axis a, b, c\n  curve one{1, 2, 3}",
  treemap: 'treemap-beta\n  "Root"\n    "Leaf": 10',
  gitgraph: "gitGraph\n  commit\n  branch b\n  commit\n  checkout main\n  merge b",
};

describe("parse engine adapters", () => {
  for (const [name, source] of Object.entries(SAMPLES)) {
    test(`${name} yields at least one node`, async () => {
      const stats = await buildDocModel(fence(source)).diagrams[0]?.stats();
      expect(stats?.error).toBeNull();
      expect(stats?.nodes ?? 0).toBeGreaterThan(0);
    });
  }

  test("a diagram of an unknown type carries the parser's reason", async () => {
    const stats = await buildDocModel(fence("notADiagram\n  x")).diagrams[0]?.stats();
    expect(stats?.nodes).toBe(0);
    expect(stats?.error).toBeTruthy();
  });

  test("indentation encodes a tree's edges and depth", () => {
    const stats = indentTreeStats([
      { label: "root", indent: 0 },
      { label: "a", indent: 2 },
      { label: "b", indent: 4 },
    ]);
    expect(stats).toEqual({ labels: ["root", "a", "b"], edges: 2, depth: 2 });
    expect(indentTreeStats([])).toEqual({ labels: [], edges: 0, depth: 0 });
  });
});
