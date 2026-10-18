// What a plan draws for its group nodes and stubs: a long label cut in the
// middle, a label no other node shows, a mark telling a group from a node in
// every type, and a stub naming the one thing it stands for.

import { describe, expect, test } from "bun:test";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { groupLabels, LABEL_CAP, shorten } from "../../src/split/label.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { faithful } from "./faithful.ts";
import { lines, target } from "./helpers.ts";

const must = async (source: string, config = target(5, 12)): Promise<SplitPlan> => {
  const out = await splitOutcome(source, config);
  expect(out.violations).toEqual([]);
  if (!out.plan) throw new Error(out.reason);
  expect(await faithful(source, out.plan)).toEqual([]);
  return out.plan;
};

describe("group labels", () => {
  test("a long label is cut in its middle, so its start and end both show", () => {
    const label = "This label goes on and on about every retry and backoff of step 12";
    const cut = shorten(label);
    expect([...cut].length).toBeLessThanOrEqual(LABEL_CAP);
    expect(cut.startsWith("This label goes on")).toBe(true);
    expect(cut.endsWith("of step 12")).toBe(true);
    expect(cut).toContain("…");
  });

  test("markup and short labels are never cut", () => {
    expect(shorten("short")).toBe("short");
    const tagged = `<b>${"x".repeat(60)}</b>`;
    expect(shorten(tagged)).toBe(tagged);
    expect(shorten("y".repeat(60), true)).toBe("y".repeat(60));
  });

  test("the choices run from the cut label to the whole label to the label with its id", () => {
    expect(groupLabels("Worker", 3, undefined, "g1")).toEqual(["Worker (+3)", "Worker (+3) [g1]"]);
  });

  test("a group never shows a label an original node shows", async () => {
    const plan = await must(
      lines(
        "flowchart TD",
        '  A --> C["Worker"] & D["Worker"] & E["Worker"] & F["Worker"]',
        "  C & D & E & F --> G",
        '  G --> H["Worker (+3)"] --> I --> J --> K --> L --> M --> N --> A',
      ),
      target(10, 16),
    );
    expect(plan.groups.map((g) => g.label)).toContain("Worker (+3) [g1]");
  });
});

describe("group marks", () => {
  const STATE = lines(
    "stateDiagram-v2",
    "  [*] --> A",
    "  A --> B1",
    "  A --> B2",
    "  A --> B3",
    "  B1 --> C",
    "  B2 --> C",
    "  B3 --> C",
    "  C --> [*]",
  );

  test("a stateDiagram group carries the group class", async () => {
    const plan = await must(STATE, target(4, 10));
    expect(plan.overviewSource).toContain("classDef group stroke-width:3px,stroke-dasharray:6 3");
    expect(plan.overviewSource).toContain("class g1 group");
  });

  test("a classDiagram group carries the group annotation", async () => {
    const plan = await must(
      lines("classDiagram", "  A --> B1", "  A --> B2", "  A --> B3", "  B1 --> C", "  B2 --> C", "  B3 --> C"),
      target(4, 10),
    );
    expect(plan.overviewSource).toContain("<<group>> g1");
  });

  test("an erDiagram group carries the group class", async () => {
    const plan = await must(
      lines("erDiagram", "  A ||--o{ B1 : has", "  A ||--o{ B2 : has", "  A ||--o{ B3 : has", "  A ||--o{ B4 : has"),
      target(3, 8),
    );
    expect(plan.overviewSource).toContain("class g1,g2 group");
  });
});

describe("stubs", () => {
  const TWO = lines(
    "flowchart LR",
    "  subgraph P [Producers]",
    "    p1 --> p2",
    "    p1 --> p3",
    "  end",
    "  subgraph Q [Consumers]",
    "    q1 --> q2",
    "    q1 --> q3",
    "  end",
    "  p2 --> q1",
    "  p3 --> q1",
    "  p3 --> q2",
  );

  test("an edge from another group comes in from one stub for that whole group", async () => {
    const plan = await must(TWO, target(4, 14));
    const consumers = plan.details.find((d) => d.graph.subgraphs.some((s) => s.id === "Q"));
    const producers = plan.groups.find((g) => g.labelBase === "Producers");
    expect(Object.values(consumers?.stubs ?? {})).toEqual([producers?.id ?? "none"]);
    expect(consumers?.source).toContain('s1(["Producers (+3)"])');
  });

  test("the source's own detail draws each edge to the exact node, named with its group", async () => {
    const plan = await must(TWO, target(4, 14));
    const producers = plan.details.find((d) => d.graph.subgraphs.some((s) => s.id === "P"));
    expect(Object.values(producers?.stubs ?? {}).sort()).toEqual(["q1", "q2"]);
    expect(producers?.source).toContain('(["q1 (Consumers)"])');
  });

  test("a stub whose text another node shows names the id it stands for", async () => {
    const plan = await must(
      lines(
        "flowchart LR",
        '  a["Payment"] --> b1 & b2 & b3',
        "  b1 & b2 & b3 --> c",
        '  c --> d["Payment"]',
        "  d --> e --> f --> g",
      ),
      target(6, 12),
    );
    const labels = plan.details.flatMap((d) => d.graph.nodes.filter((n) => d.stubs[n.id]).map((n) => n.label));
    expect(labels).toContain("Payment [a]");
  });
});

describe("evenly folded plans", () => {
  test("nodes alike in label but unconnected are never gathered on their labels alone", async () => {
    const isolated = Array.from({ length: 20 }, (_, i) => `  iso${i}[Isolated ${i}]`);
    const out = await splitOutcome(
      lines("flowchart TD", ...isolated, "  a --> b", "  b --> c"),
      configFromPreset("low-density"),
    );
    expect(out.plan).toBeNull();
    expect(out.reason).toStartWith("no tier reaches the target");
  });
});
