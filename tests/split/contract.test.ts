// The contract on a real plan, then on copies of it broken one way at a time:
// each broken copy must be rejected by the check it breaks.

import { describe, expect, test } from "bun:test";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { buildOf, lines, target } from "./helpers.ts";

const SOURCE = lines(
  "flowchart LR",
  "  subgraph A [Alpha]",
  "    a1 --> a2",
  "    a2 -->|on| a3",
  "    a1 -.-> a3",
  "  end",
  "  subgraph B [Beta]",
  "    b1 --> b2",
  "    b1 --> b3",
  "  end",
  "  q{ready?} --> a1",
  "  a3 --> b1",
  "  a2 -->|late| b1",
  "  b2 --> y",
  "  q -->|no| y",
  "  q -->|no| y",
);
const CONFIG = target(5, 14);

const build = await buildOf(SOURCE, CONFIG);
const copy = (): Build => structuredClone(build);

const rejects = async (broken: Build, check: string): Promise<void> => {
  const violations = await checkContract(broken, CONFIG);
  expect(violations.some((v) => v.startsWith(`${check}:`))).toBe(true);
};

const firstGroup = (b: Build) => b.plan.groups[0] as Build["plan"]["groups"][number];

describe("a plan as planned", () => {
  test("folds both author regions and passes every check", async () => {
    expect(build.plan.groups.map((g) => g.label)).toEqual(["Alpha (+3)", "Beta (+3)"]);
    expect(await checkContract(build, CONFIG)).toEqual([]);
  });
});

describe("checks 1 to 3 reject the plan they are about", () => {
  test("1: a member dropped from its group", async () => {
    const b = copy();
    firstGroup(b).members.pop();
    await rejects(b, "1");
  });

  test("1: a member that is no original node", async () => {
    const b = copy();
    firstGroup(b).members.push("ghost");
    await rejects(b, "1");
  });

  test("1: a group sitting inside a region it folds", async () => {
    const b = copy();
    firstGroup(b).parent = firstGroup(b).regions[0] ?? null;
    await rejects(b, "1");
  });

  test("2: an overview edge standing for nothing", async () => {
    const b = copy();
    const [first] = b.plan.overview.edges;
    b.covers[first?.id ?? ""] = [];
    await rejects(b, "2");
  });

  test("2: an overview edge covering an edge between other nodes", async () => {
    const b = copy();
    const [first, second] = b.plan.overview.edges;
    b.covers[first?.id ?? ""] = [...(b.covers[first?.id ?? ""] ?? []), ...(b.covers[second?.id ?? ""] ?? [])];
    await rejects(b, "2");
  });

  test("3: a label the covered edges do not share", async () => {
    const b = copy();
    const merged = b.plan.overview.edges.find((e) => (b.covers[e.id]?.length ?? 0) > 1);
    if (merged) merged.label = "invented";
    await rejects(b, "3");
  });

  test("3: a shape the members do not share", async () => {
    const b = copy();
    firstGroup(b).shape = "cyl";
    await rejects(b, "3");
  });
});

describe("checks 4 to 6 reject the plan they are about", () => {
  test("4: a label not from the data", async () => {
    const b = copy();
    firstGroup(b).label = "Everything else (+3)";
    firstGroup(b).labelBase = "Everything else";
    await rejects(b, "4");
  });

  test("4: a label that is not its parts", async () => {
    const b = copy();
    firstGroup(b).label = "Alpha";
    await rejects(b, "4");
  });

  test("4: a wrong hidden count", async () => {
    const b = copy();
    firstGroup(b).label = "Alpha (+9)";
    firstGroup(b).hidden = 9;
    await rejects(b, "4");
  });

  test("5: a detail edge lost", async () => {
    const b = copy();
    b.plan.details[0]?.graph.edges.pop();
    await rejects(b, "5");
  });

  test("5: a stub standing for a member", async () => {
    const b = copy();
    const d = b.plan.details[0];
    const stub = Object.keys(d?.stubs ?? {})[0] ?? "";
    if (d) d.stubs[stub] = firstGroup(b).members[0] ?? "";
    await rejects(b, "5");
  });

  test("5: a detail split that was never checked", async () => {
    const b = copy();
    const d = b.plan.details[0];
    if (d) d.split = b.plan;
    await rejects(b, "5");
  });

  test("6: a decision node folded outside a whole region", async () => {
    const b = copy();
    firstGroup(b).members.push("q");
    firstGroup(b).members.sort();
    b.plan.overview.nodes = b.plan.overview.nodes.filter((n) => n.id !== "q");
    await rejects(b, "6");
  });
});

describe("checks 7 to 9 reject the plan they are about", () => {
  test("7: a wrong declared loss", async () => {
    const b = copy();
    b.plan.loss.newReachablePairs += 1;
    await rejects(b, "7");
  });

  test("7: a T2 snapshot that made new reachable pairs", async () => {
    const b = copy();
    b.snapshots = [{ tier: "T2", groups: [{ members: ["a1", "y"], regions: [] }] }];
    b.plan.loss.byTier = {};
    await rejects(b, "7");
  });

  test("7: wrong dropped rows", async () => {
    const b = copy();
    b.plan.loss.droppedRows = 3;
    await rejects(b, "7");
  });

  test("8: groups out of order", async () => {
    const b = copy();
    b.plan.groups.reverse();
    await rejects(b, "8");
  });

  test("8: edges out of order", async () => {
    const b = copy();
    b.plan.overview.edges.reverse();
    await rejects(b, "8");
  });

  test("9: an overview that does not parse", async () => {
    const b = copy();
    b.plan.overviewSource = "flowchart LR\n  A -->";
    await rejects(b, "9");
  });

  test("9: a detail over the target", async () => {
    const b = copy();
    const d = b.plan.details[0];
    if (d) d.source = SOURCE;
    await rejects(b, "9");
  });

  test("9: an overview score other than planned", async () => {
    const b = copy();
    b.plan.overviewScore += 1;
    await rejects(b, "9");
  });
});
