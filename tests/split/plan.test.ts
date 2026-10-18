// splitPlan end to end on real diagrams of each type it folds: the plan it
// offers, the sources it emits parsing again, and the reasons it offers none.

import { describe, expect, test } from "bun:test";
import { extractGraph } from "../../src/parse/graph.ts";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { quoteLabel } from "../../src/split/emit.ts";
import { splitOutcome, splitPlan } from "../../src/split/index.ts";
import { labelBag, similarity, stem } from "../../src/split/stem.ts";
import { lines, target } from "./helpers.ts";

const must = async (source: string, nodes: number, vcs: number) => {
  const out = await splitOutcome(source, target(nodes, vcs));
  expect(out.violations).toEqual([]);
  if (!out.plan) throw new Error(out.reason);
  return out.plan;
};

describe("flowchart", () => {
  const src = lines(
    "flowchart TD",
    '  api["API gateway"] --> s1["Orders"] & s2["Billing"] & s3["Search"]',
    "  s1 & s2 & s3 --> db[(Store)]",
    '  subgraph obs ["Ops #quot;box#quot;"]',
    "    m1 --> m2 --> m3",
    "  end",
    "  db -.-> m1",
  );

  test("folds twins and a chain, marks groups and stubs, keeps the direction and region", async () => {
    const plan = await must(src, 5, 12);
    expect(plan.groups.map((g) => [g.tier, g.reason, g.label])).toEqual([
      ["T2", "chain stage", "m1 (+1)"],
      ["T2", "twins", "Orders (+2)"],
    ]);
    expect(plan.overviewSource.split("\n")[0]).toBe("flowchart TB");
    expect(plan.overviewSource).toContain('g2[["Orders (+2)"]]');
    expect(plan.overviewSource).toContain('subgraph obs["Ops #quot;box#quot;"]');
    expect(plan.details[1]?.source).toContain('s4(["API gateway"])');
    expect(plan.details[1]?.source).toContain("classDef stub stroke-dasharray:4");
    expect(plan.loss.byTier.T2).toBe(0);
  });

  test("an emitted source reads back to the planned graph", async () => {
    const plan = await must(src, 5, 12);
    const again = await extractGraph(plan.overviewSource);
    const byId = (xs: { id: string; shape?: string }[]) => xs.map((n) => [n.id, n.shape]).sort();
    expect(byId(again.nodes)).toEqual(byId(plan.overview.nodes));
    expect(again.edges.map((e) => [e.source, e.target, e.kind])).toEqual(
      plan.overview.edges.map((e) => [e.source, e.target, e.kind ?? "-->"]),
    );
  });
});

describe("flowchart split twice", () => {
  test("a region too large for one detail is split again", async () => {
    const big = lines(
      "flowchart LR",
      "  subgraph R [Outer]",
      "    subgraph R1 [One]",
      "      a1 --> a2 --> a3 --> a1",
      "      a1 --> a3",
      "    end",
      "    subgraph R2 [Two]",
      "      b1 --> b2 --> b3 --> b1",
      "      b1 --> b3",
      "    end",
      "    a3 --> b1",
      "  end",
      "  in --> a1",
      "  b3 --> out",
      "  in --> out",
    );
    const plan = await must(big, 6, 8);
    expect(plan.groups.map((g) => g.label)).toEqual(["Outer (+6)"]);
    expect(plan.details[0]?.split?.groups.map((g) => g.label)).toEqual(["One (+3)", "Two (+3)"]);
  });
});

describe("stateDiagram", () => {
  const src = lines(
    "stateDiagram-v2",
    "  [*] --> Idle",
    "  Idle --> Busy : start",
    "  state Busy {",
    "    [*] --> Work",
    "    Work --> Check",
    "    state pick <<choice>>",
    "    Check --> pick",
    "    pick --> Work : retry",
    "    pick --> [*] : done",
    "  }",
    "  Busy --> Idle : stop",
    "  Idle --> Off",
    "  Off --> [*]",
  );

  test("folds inside a composite, never its choice, keeping the markers", async () => {
    const plan = await must(src, 5, 12);
    expect(plan.groups.map((g) => [g.label, g.members, g.parent])).toEqual([
      ["Check (+1)", ["Check", "Work"], "Busy__group"],
    ]);
    expect(plan.overviewSource).toContain("[*] --> Idle");
    expect(plan.overviewSource).toContain("state pick <<choice>>");
    expect(plan.overviewSource).toContain("state Busy {");
    expect(plan.details[0]?.source).toContain("[*] --> Work");
  });
});

describe("erDiagram", () => {
  const src = lines(
    "erDiagram",
    '  CUSTOMER ||--o{ ORDER : "places #quot;now#quot;"',
    "  ORDER ||--|{ LINE : contains",
    "  ORDER ||--o{ NOTE : has",
    "  PRODUCT ||--o{ LINE : listed",
    "  CUSTOMER ||--o{ ADDRESS : has",
    "  CUSTOMER {",
    "    string id PK",
    "    string name",
    "  }",
  );

  test("drops rows and folds an aggregate, never merging cardinalities", async () => {
    const plan = await must(src, 4, 8);
    expect(plan.loss.droppedRows).toBe(2);
    expect(plan.overviewSource.split("\n")[0]).toBe("erDiagram");
    const cards = plan.overview.edges.map((e) => e.cardinality);
    expect(cards.every((c) => c !== undefined)).toBe(true);
  });

  test("drops rows alone when that meets the target", async () => {
    const plan = await must(src, 6, 8.75);
    expect(plan.tier).toBe("T1");
    expect(plan.groups).toEqual([]);
  });
});

describe("classDiagram", () => {
  const src = lines(
    "classDiagram",
    "  namespace shop {",
    "    class Cart",
    "    class Item",
    "    class Price",
    "  }",
    "  class User",
    "  User --> Cart : owns",
    '  Cart "1" *-- "*" Item',
    "  Item --> Price",
    "  User --() Login",
    "  User <|-- Admin",
  );

  test("folds a namespace, splits its detail again, and keeps a lollipop on its class", async () => {
    const plan = await must(src, 3, 7);
    expect(plan.details[0]?.split?.groups[0]?.label).toBe("Item (+1)");
    expect(plan.groups[0]?.label).toBe("shop (+3)");
    expect(plan.overviewSource).toContain("User --() Login");
    expect(plan.details[0]?.source).toContain("<<stub>>");
    expect(plan.details[0]?.source).toContain('Cart "1" *-- "*" Item');
  });
});

describe("no plan", () => {
  const high = configFromPreset("high-density");

  test("for a sequence diagram", async () => {
    const out = await splitOutcome("sequenceDiagram\n  A->>B: hi", target(1, 1));
    expect(out.reason).toContain("sequence");
  });

  test("for a type it does not fold", async () => {
    expect((await splitOutcome('pie\n  title x\n  "a" : 1', target(0, 0))).reason).toContain("not split");
  });

  test("for a diagram that does not parse", async () => {
    expect((await splitOutcome("flowchart LR\n  A -->", high)).reason).toContain("does not parse");
  });

  test("for a diagram already within the target", async () => {
    expect(await splitPlan("flowchart LR\n  A --> B", high)).toBeNull();
  });

  test("when every node is protected", async () => {
    const out = await splitOutcome(
      lines("flowchart LR", "  a{1} --> b{2} --> c{3} --> d{4}", "  a --> c"),
      target(2, 3),
    );
    expect(out.reason).toContain("no tier reaches the target");
  });
});

describe("labels and similarity", () => {
  test("a quote in a label is written as an entity, and a parsed entity comes back", () => {
    expect(quoteLabel('say "hi"\nnow')).toBe("say #quot;hi#quot;<br>now");
    expect(quoteLabel("ﬂ°quot¶ßxﬂ°°35¶ß")).toBe("#quot;x#35;");
  });

  test("stems with Porter's stemmer", () => {
    expect(["orders", "queries", "classes", "boxes", "running", "stored", "status", "db"].map(stem)).toEqual([
      "order",
      "queri",
      "class",
      "box",
      "run",
      "store",
      "statu",
      "db",
    ]);
  });

  test("role words weigh a quarter and id-like labels nothing", () => {
    const sim = (a: string, b: string): number => similarity(labelBag(a, "x"), labelBag(b, "y"));
    expect(sim("Order service", "Orders DB")).toBeCloseTo(2 / 3);
    expect(sim("Order service", "Payment service")).toBeCloseTo(0.25 / 2.25);
    expect(labelBag("N12", "n").size).toBe(0);
    expect(labelBag("Same", "Same").size).toBe(0);
    expect(similarity(new Set(), new Set())).toBe(0);
  });
});
