// Contract check 8 in practice: a plan is byte-identical across runs and
// across any reordering of statements that leaves the parsed graph the same.

import { describe, expect, test } from "bun:test";
import { extractGraph } from "../../src/parse/graph.ts";
import { splitPlan } from "../../src/split/index.ts";
import { target } from "./helpers.ts";

// A seeded shuffle, so a failure names the order it saw.
const shuffled = <T>(xs: readonly T[], seed: number): T[] => {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

// The parsed graph with every list sorted and edge ids left out.
const canonical = async (source: string): Promise<string> => {
  const g = await extractGraph(source);
  const nodes = g.nodes.map((n) => JSON.stringify(n)).sort();
  const edges = g.edges.map(({ id: _id, ...e }) => JSON.stringify(e)).sort();
  const subgraphs = g.subgraphs.map((s) => JSON.stringify(s)).sort();
  return JSON.stringify({ nodes, edges, subgraphs });
};

const CASES: Array<{ name: string; head: string; statements: string[]; nodes: number; vcs: number }> = [
  {
    name: "flowchart",
    head: "flowchart LR",
    statements: [
      '  subgraph A [Alpha]\n    a1["One"]\n    a2["Two"]\n    a3["Three"]\n  end',
      '  subgraph B [Beta]\n    b1["Four"]\n    b2["Five"]\n  end',
      "  a1 --> a2",
      "  a2 -->|on| a3",
      "  a1 -.-> a3",
      "  b1 --> b2",
      "  hub --> l1 & l2 & l3",
      "  hub -->|x| a1",
      "  hub -->|y| a1",
      "  a3 --> b1",
      "  b2 --> hub",
      "  b2 --> k1 --> k2 --> k3 --> k4 --> hub",
    ],
    nodes: 7,
    vcs: 16,
  },
  {
    name: "erDiagram",
    head: "erDiagram",
    statements: [
      "  CUSTOMER ||--o{ ORDER : places",
      "  ORDER ||--|{ LINE : contains",
      "  ORDER ||--o{ NOTE : has",
      "  PRODUCT ||--o{ LINE : listed",
      "  CUSTOMER ||--o{ ADDRESS : has",
      "  FILM ||--o{ FILM_ACTOR : casts",
      "  ACTOR ||--o{ FILM_ACTOR : plays",
      "  PRODUCT ||--o{ FILM : licenses",
      "  CUSTOMER ||--o{ REVIEW : writes",
      "  PRODUCT ||--o{ REVIEW : gets",
    ],
    nodes: 5,
    vcs: 10,
  },
  {
    name: "stateDiagram",
    head: "stateDiagram-v2",
    statements: [
      "  [*] --> Idle",
      "  Idle --> Busy : start",
      "  state Busy {\n    [*] --> Work\n    Work --> Check\n    Check --> Work : retry\n    Check --> [*]\n  }",
      "  Busy --> Idle : stop",
      "  Idle --> Off",
      "  Idle --> Sleep",
      "  Sleep --> Off",
      "  Off --> [*]",
      "  Idle --> Audit",
      "  Audit --> Off",
    ],
    nodes: 4,
    vcs: 12,
  },
];

describe("a plan does not depend on statement order", () => {
  for (const c of CASES) {
    test(c.name, async () => {
      const config = target(c.nodes, c.vcs);
      const base = [c.head, ...c.statements].join("\n");
      const first = await splitPlan(base, config);
      expect(first?.groups.length).toBeGreaterThan(1);
      const expected = JSON.stringify(first);
      expect(JSON.stringify(await splitPlan(base, config))).toBe(expected);
      for (const seed of [1, 7, 42, 99]) {
        const source = [c.head, ...shuffled(c.statements, seed)].join("\n");
        expect(await canonical(source)).toBe(await canonical(base));
        expect(JSON.stringify(await splitPlan(source, config))).toBe(expected);
      }
    });
  }
});
