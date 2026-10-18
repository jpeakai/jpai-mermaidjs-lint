// Each tier on a small hand diagram, read by the real parsers: what it
// proposes, and what it never proposes.

import { describe, expect, test } from "bun:test";
import { merge } from "../../src/split/quotient.ts";
import { proposeChains, proposeT2, proposeTwins } from "../../src/split/tier2.ts";
import { proposeT3 } from "../../src/split/tier3.ts";
import { proposeT4 } from "../../src/split/tier4.ts";
import { proposeT5 } from "../../src/split/tier5.ts";
import { proposeT6 } from "../../src/split/tier6.ts";
import { ctxOf, lines, target, workOf } from "./helpers.ts";

const roomy = target(25, 40);

describe("T2 lossless structure", () => {
  test("twins share every neighbour and fold together", async () => {
    const work = await workOf(lines("flowchart LR", "  A --> B1 & B2 & B3", "  B1 & B2 & B3 --> C"));
    const twins = proposeTwins(ctxOf(work, roomy));
    expect(twins.map((c) => [c.keys, c.reason])).toEqual([[["B1", "B2", "B3"], "twins"]]);
  });

  test("sibling leaves of one hub fold as a bundle, but not across a label", async () => {
    const work = await workOf(lines("flowchart LR", "  H --> l1 & l2 & l3", "  H -->|odd| l4"));
    const twins = proposeTwins(ctxOf(work, roomy));
    expect(twins.map((c) => [c.keys, c.reason])).toEqual([[["l1", "l2", "l3"], "sibling leaves"]]);
  });

  test("a decision node is never a twin", async () => {
    const work = await workOf(lines("flowchart LR", "  A --> B1{one} & B2{two}", "  B1 & B2 --> C"));
    expect(proposeTwins(ctxOf(work, roomy))).toEqual([]);
  });

  test("an isolated node has no neighbourhood to share", async () => {
    const work = await workOf(lines("flowchart LR", "  A", "  B", "  C"));
    expect(proposeT2(ctxOf(work, roomy))).toEqual([]);
  });

  test("twins too many for one detail are cut into runs that fit", async () => {
    const work = await workOf(lines("flowchart LR", "  H --> a & b & c & d & e & f"));
    const runs = proposeTwins(ctxOf(work, target(4, 40))).map((c) => c.keys);
    expect(runs).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  test("a long chain folds in two stages or more, never whole", async () => {
    const work = await workOf(lines("flowchart LR", "  s --> a --> b --> c --> d --> e --> f --> t"));
    const stages = proposeChains(ctxOf(work, roomy)).map((c) => c.keys);
    expect(stages).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  test("a closed loop has no start, so no chain", async () => {
    const work = await workOf(lines("flowchart LR", "  a --> b --> c --> a"));
    expect(proposeChains(ctxOf(work, roomy))).toEqual([]);
  });

  test("after a merge, a staged group stays its own stage", async () => {
    const work = await workOf(lines("flowchart LR", "  s --> a --> b --> c --> d --> t"));
    const ctx = ctxOf(work, roomy);
    const [first] = proposeChains(ctx);
    expect(first?.keys).toEqual(["a", "b"]);
    const next = merge(ctx.part, first as NonNullable<typeof first>);
    expect(proposeChains(ctxOf(work, roomy, next)).map((c) => c.keys)).toEqual([["c", "d"]]);
  });
});

describe("T3 author regions", () => {
  test("innermost regions first, then the region around them", async () => {
    const src = lines(
      "flowchart LR",
      "  subgraph Outer [Outer box]",
      "    subgraph Inner [Inner box]",
      "      a --> b",
      "    end",
      "    c",
      "  end",
      "  x --> a",
    );
    const work = await workOf(src);
    const ctx = ctxOf(work, roomy);
    const first = proposeT3(ctx);
    expect(first.map((c) => [c.keys, c.regions])).toEqual([[["a", "b"], ["Inner"]]]);
    const next = merge(ctx.part, first[0] as NonNullable<(typeof first)[0]>);
    const second = proposeT3(ctxOf(work, roomy, next));
    expect(second.map((c) => [c.keys, c.regions])).toEqual([[["c", "\u0000a"], ["Outer"]]]);
  });

  test("a composite state folds with its own state", async () => {
    const src = lines(
      "stateDiagram-v2",
      "  [*] --> Idle",
      "  Idle --> Busy",
      "  state Busy {",
      "    [*] --> Work",
      "    Work --> Done",
      "  }",
    );
    const work = await workOf(src);
    const cands = proposeT3(ctxOf(work, roomy));
    expect(cands.map((c) => [c.keys, c.regions, c.parent])).toEqual([
      [["Busy", "Done", "Work"], ["Busy__group"], null],
    ]);
  });

  test("a class namespace folds", async () => {
    const work = await workOf(
      lines("classDiagram", "  namespace shop {", "    class Cart", "    class Item", "  }", "  Cart --> Item"),
    );
    expect(proposeT3(ctxOf(work, roomy)).map((c) => c.keys)).toEqual([["Cart", "Item"]]);
  });
});

describe("T4 erDiagram aggregates", () => {
  test("a root folds with the weak entities it alone identifies", async () => {
    const src = lines(
      "erDiagram",
      "  ORDER ||--|{ LINE : contains",
      "  ORDER ||--o{ NOTE : has",
      "  PRODUCT ||--o{ LINE : in",
      "  CUSTOMER ||..o{ ORDER : places",
    );
    const work = await workOf(src);
    const cands = proposeT4(ctxOf(work, roomy));
    expect(cands.map((c) => [c.keys, c.reason])).toContainEqual([["NOTE", "ORDER"], "aggregate root"]);
    expect(cands.some((c) => c.keys.includes("LINE") && c.reason === "aggregate root")).toBe(false);
  });

  test("a junction table folds into the smaller entity it joins", async () => {
    const src = lines(
      "erDiagram",
      "  FILM ||--o{ FILM_ACTOR : casts",
      "  ACTOR ||--o{ FILM_ACTOR : plays",
      "  FILM ||--o{ RENTAL : rented",
      "  FILM ||--o{ REVIEW : reviewed",
    );
    const work = await workOf(src);
    const junction = proposeT4(ctxOf(work, roomy)).filter((c) => c.reason === "junction table");
    expect(junction.map((c) => c.keys)).toEqual([["ACTOR", "FILM_ACTOR"]]);
  });

  test("only an erDiagram has aggregates", async () => {
    const work = await workOf(lines("flowchart LR", "  a --> b"));
    expect(proposeT4(ctxOf(work, roomy))).toEqual([]);
  });
});

describe("T5 leaf folding", () => {
  test("leaves fold into their one neighbour", async () => {
    const work = await workOf(
      lines("flowchart LR", "  hub --> a", "  b --> hub", "  hub --> c", "  c --> hub2", "  hub2 --> hub"),
    );
    const cands = proposeT5(ctxOf(work, roomy));
    expect(cands.map((c) => c.keys)).toEqual([["hub", "a", "b"]]);
  });

  test("never into a decision node", async () => {
    const work = await workOf(lines("flowchart LR", "  q{ok?} --> a", "  q --> b", "  b --> q"));
    expect(proposeT5(ctxOf(work, roomy))).toEqual([]);
  });
});

describe("T6 suggested grouping", () => {
  test("ranks a pair joined by many edges above a pair joined by one", async () => {
    const work = await workOf(
      lines("flowchart LR", "  a --> b", "  a -->|x| b", "  b -->|y| a", "  b --> c", "  c --> d"),
    );
    const [best] = proposeT6(ctxOf(work, roomy)).sort((x, y) => (y.priority ?? 0) - (x.priority ?? 0));
    expect(best?.keys).toEqual(["a", "b"]);
  });

  test("pairs alike in label with no edge between them", async () => {
    const src = lines("flowchart LR", '  a["Order service"]', '  b["Orders DB"]', '  c["Payment gateway"]');
    const cands = proposeT6(ctxOf(await workOf(src), roomy));
    expect(cands.map((c) => c.keys)).toEqual([["a", "b"]]);
  });

  test("never pairs across an author region", async () => {
    const src = lines("flowchart LR", "  subgraph S", "    a", "  end", "  b", "  a --> b");
    expect(proposeT6(ctxOf(await workOf(src), roomy))).toEqual([]);
  });
});
