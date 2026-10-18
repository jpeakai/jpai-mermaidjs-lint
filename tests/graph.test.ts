// What the element-level graph keeps beyond the counts: each node's shape, and
// each edge's name, label, kind and cardinality, read from the real parsers.
// Every graph here also counts the same nodes, edges and subgraphs as the stats.

import { describe, expect, test } from "bun:test";
import { type DiagramGraph, extractGraph } from "../src/parse/graph.ts";
import { extractStats } from "../src/parse/stats.ts";

// Reads the graph and checks it counts what the stats count.
const graphOf = async (source: string): Promise<DiagramGraph> => {
  const [graph, stats] = await Promise.all([extractGraph(source), extractStats(source)]);
  expect(stats.error).toBeNull();
  expect(graph.nodes.length).toBe(stats.nodes);
  expect(graph.edges.length).toBe(stats.edges);
  expect(graph.subgraphs.length).toBe(stats.subgraphs);
  return graph;
};

const ends = (graph: DiagramGraph): string[][] => graph.edges.map((e) => [e.source, e.target]);

describe("flowchart graph", () => {
  test("an edge to a subgraph's id runs to the subgraph, which is not also a node", async () => {
    const graph = await graphOf("flowchart LR\n  A --> S\n  subgraph S [Billing]\n    x --> y\n  end\n  S --> B");
    expect(graph.nodes.map((n) => n.id)).toEqual(["A", "x", "y", "B"]);
    expect(ends(graph)).toEqual([
      ["A", "S"],
      ["x", "y"],
      ["S", "B"],
    ]);
    expect(graph.subgraphs).toEqual([{ id: "S", label: "Billing", parent: null }]);
  });

  test("keeps each node's shape, and each edge's mermaid id, label and arrow", async () => {
    const graph = await graphOf(
      "flowchart LR\n  A{dec} -->|yes| B([stad])\n  A -.-> C((circ))\n  A ==> D>flag]\n  A --- E\n  K@{ shape: cyl, label: db }\n  K e1@--> A\n  A -->|one| L & M\n  A --> B",
    );
    expect(graph.nodes.map((n) => [n.id, n.shape])).toEqual([
      ["A", "diamond"],
      ["B", "stadium"],
      ["C", "circle"],
      ["D", "odd"],
      ["E", "square"],
      ["K", "cyl"],
      ["L", "square"],
      ["M", "square"],
    ]);
    expect(graph.edges).toEqual([
      { id: "L_A_B_0", source: "A", target: "B", kind: "-->", label: "yes" },
      { id: "L_A_C_0", source: "A", target: "C", kind: "-.->" },
      { id: "L_A_D_0", source: "A", target: "D", kind: "==>" },
      { id: "L_A_E_0", source: "A", target: "E", kind: "---" },
      { id: "e1", source: "K", target: "A", kind: "-->" },
      { id: "L_A_L_0", source: "A", target: "L", kind: "-->", label: "one" },
      { id: "L_A_M_0", source: "A", target: "M", kind: "-->", label: "one" },
      // Mermaid numbers a second link between the same two from 2, not 1.
      { id: "L_A_B_2", source: "A", target: "B", kind: "-->" },
    ]);
  });

  // Each arrow mermaid's flowchart grammar reads, which the kind writes back as
  // the source spelled it. A stretched arrow only spaces the layout.
  const ARROWS = ["-->", "---", "--o", "--x", "<-->", "o--o", "x--x", "-.->", "-.-", "-.-o", "-.-x", "<-.->"];
  const MORE = ["o-.-o", "x-.-x", "==>", "===", "==o", "==x", "<==>", "o==o", "x==x", "~~~"];
  for (const arrow of [...ARROWS, ...MORE]) {
    test(`reads the ${arrow} arrow back as its kind`, async () => {
      expect((await graphOf(`flowchart LR\n  A ${arrow} B`)).edges[0]?.kind).toBe(arrow);
    });
  }

  test("reads a stretched arrow as the arrow it stretches", async () => {
    expect((await graphOf("flowchart LR\n  A ---> B")).edges[0]?.kind).toBe("-->");
  });

  test("reads flowchart-elk as a flowchart", async () => {
    const graph = await graphOf("flowchart-elk TD\n  A --> B\n  B --> C");
    expect(graph.diagram_type).toBe("flowchart-elk");
    expect(ends(graph)).toEqual([
      ["A", "B"],
      ["B", "C"],
    ]);
  });
});

describe("erDiagram graph", () => {
  test("keeps each relationship's label, line and cardinality as the source wrote it", async () => {
    const graph = await graphOf(
      'erDiagram\n  A |o--o{ B : x\n  C }|..|| D : y\n  E u--o{ F : z\n  A ||--|{ C : "w"\n  A |o--o{ B : again',
    );
    expect(graph.edges).toEqual([
      { id: "L_A_B_0", source: "A", target: "B", kind: "--", cardinality: "|o--o{", label: "x" },
      { id: "L_C_D_0", source: "C", target: "D", kind: "..", cardinality: "}|..||", label: "y" },
      { id: "L_E_F_0", source: "E", target: "F", kind: "--", cardinality: "u--o{", label: "z" },
      { id: "L_A_C_0", source: "A", target: "C", kind: "--", cardinality: "||--|{", label: "w" },
      { id: "L_A_B_1", source: "A", target: "B", kind: "--", cardinality: "|o--o{", label: "again" },
    ]);
  });
});

describe("stateDiagram graph", () => {
  const SOURCE =
    "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: start\n  state Busy {\n    [*] --> Work\n    Work --> Done: finish\n    Done --> [*]\n  }\n  state c <<choice>>\n  Busy --> c\n  c --> Idle: stop\n  note right of Idle: hi";

  test("keeps each state's shape and each transition's label, without counting markers", async () => {
    const graph = await graphOf(SOURCE);
    expect(graph.nodes.map((n) => [n.id, n.shape, n.parent])).toEqual([
      ["Idle", "rect", null],
      ["Busy", "roundedWithTitle", "Busy__group"],
      ["Work", "rect", "Busy__group"],
      ["Done", "rect", "Busy__group"],
      ["c", "choice", null],
    ]);
    expect(graph.edges).toEqual([
      { id: "L_Idle_Busy_0", source: "Idle", target: "Busy", label: "start" },
      { id: "L_Work_Done_0", source: "Work", target: "Done", label: "finish" },
      { id: "L_Busy_c_0", source: "Busy", target: "c" },
      { id: "L_c_Idle_0", source: "c", target: "Idle", label: "stop" },
    ]);
  });

  test("keeps the start and end markers and their transitions apart, and drops notes", async () => {
    const graph = await graphOf(SOURCE);
    expect(graph.pseudo?.nodes).toEqual([
      { id: "root_start", label: "root_start", parent: null, shape: "stateStart" },
      { id: "Busy_start", label: "Busy_start", parent: "Busy__group", shape: "stateStart" },
      { id: "Busy_end", label: "Busy_end", parent: "Busy__group", shape: "stateEnd" },
    ]);
    expect(graph.pseudo?.edges.map((e) => [e.source, e.target])).toEqual([
      ["root_start", "Idle"],
      ["Busy_start", "Work"],
      ["Done", "Busy_end"],
    ]);
  });

  test("keeps fork and join states as counted nodes with their shapes", async () => {
    const graph = await graphOf(
      "stateDiagram\n  state f <<fork>>\n  state j <<join>>\n  [*] --> f\n  f --> a\n  f --> b\n  a --> j\n  b --> j\n  j --> [*]",
    );
    expect(graph.nodes.filter((n) => n.id === "f" || n.id === "j").map((n) => n.shape)).toEqual(["fork", "join"]);
  });

  test("puts the states in each concurrency region, and its start marker, inside the composite", async () => {
    const graph = await graphOf(
      "stateDiagram-v2\n  state Active {\n    [*] --> A\n    A --> B\n    --\n    [*] --> C\n    C --> D\n  }",
    );
    expect(graph.nodes.map((n) => [n.id, n.parent])).toEqual([
      ["Active", "Active__group"],
      ["A", "Active__group"],
      ["B", "Active__group"],
      ["C", "Active__group"],
      ["D", "Active__group"],
    ]);
    expect(graph.subgraphs).toEqual([{ id: "Active__group", label: "", parent: null }]);
    expect(graph.pseudo?.nodes.map((n) => n.parent)).toEqual(["Active__group", "Active__group"]);
  });
});

describe("classDiagram graph", () => {
  test("reads classes, namespaces and relations with label, kind and multiplicity", async () => {
    const graph = await graphOf(
      'classDiagram\n  namespace Shop {\n    class Order {\n      +id\n      +pay()\n    }\n    class Line\n  }\n  class Pay\n  Order "1" *-- "many" Line : contains\n  Order <|-- Pay\n  Order ..> Pay : uses\n  Pay --o Line\n  Line .. Pay\n  Line -- Order',
    );
    expect(graph.diagram_type).toBe("classDiagram");
    expect(graph.nodes).toEqual([
      { id: "Order", label: "Order", parent: "Shop", shape: "classBox" },
      { id: "Line", label: "Line", parent: "Shop", shape: "classBox" },
      { id: "Pay", label: "Pay", parent: null, shape: "classBox" },
    ]);
    expect(graph.subgraphs).toEqual([{ id: "Shop", label: "Shop", parent: null }]);
    expect(graph.edges).toEqual([
      {
        id: "L_Order_Line_0",
        source: "Order",
        target: "Line",
        kind: "*--",
        cardinality: '"1" *-- "many"',
        label: "contains",
      },
      { id: "L_Order_Pay_0", source: "Order", target: "Pay", kind: "<|--" },
      { id: "L_Order_Pay_1", source: "Order", target: "Pay", kind: "..>", label: "uses" },
      { id: "L_Pay_Line_0", source: "Pay", target: "Line", kind: "--o" },
      { id: "L_Line_Pay_0", source: "Line", target: "Pay", kind: ".." },
      { id: "L_Line_Order_0", source: "Line", target: "Order", kind: "--" },
    ]);
    expect(graph.pseudo).toEqual({ nodes: [], edges: [] });
  });

  test("reads every relation end back as its kind", async () => {
    const graph = await graphOf(
      "classDiagram-v2\n  A <|--|> B\n  G *.. H\n  I <.. J\n  K o--o L\n  M --* N\n  O ()-- P",
    );
    expect(graph.edges.map((e) => e.kind)).toEqual(["<|--|>", "*..", "<..", "o--o", "--*", "()--"]);
  });

  test("keeps a lollipop interface apart from the counted classes", async () => {
    const graph = await graphOf("classDiagram\n  C ()-- D\n  E --() F");
    expect(graph.nodes.map((n) => n.id)).toEqual(["D", "E"]);
    expect(graph.pseudo?.nodes).toEqual([
      { id: "interface0", label: "C", parent: null, shape: "lollipop" },
      { id: "interface1", label: "F", parent: null, shape: "lollipop" },
    ]);
    expect(ends(graph)).toEqual([
      ["interface0", "D"],
      ["E", "interface1"],
    ]);
  });

  test("nests one namespace inside another", async () => {
    const graph = await graphOf("classDiagram\n  namespace Outer.Inner {\n    class A\n  }\n  A --> B");
    expect(graph.subgraphs).toEqual([
      { id: "Outer", label: "Outer", parent: null },
      { id: "Outer.Inner", label: "Inner", parent: "Outer" },
    ]);
    expect(graph.nodes[0]).toEqual({ id: "A", label: "A", parent: "Outer.Inner", shape: "classBox" });
  });
});
