// What makes an overview tell a diagram's story: it lands near its target,
// keeps hubs and a decision's branches in view, names a suggested group
// after its main path, hides two nodes or more in each suggested group, and
// draws an undirected edge written both ways once.

import { describe, expect, test } from "bun:test";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { checkContract } from "../../src/split/contract.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { EVEN_SHARE } from "../../src/split/plan.ts";
import { rankedMembers } from "../../src/split/quotient.ts";
import { hubsOf, splitsBranches } from "../../src/split/rules.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { faithful } from "./faithful.ts";
import { buildOf, lines, ORDERS, target, workOf } from "./helpers.ts";

const HIGH = configFromPreset("high-density");

const planOf = async (source: string, config = HIGH): Promise<SplitPlan> => {
  const out = await splitOutcome(source, config);
  expect(out.violations).toEqual([]);
  if (!out.plan) throw new Error(out.reason);
  expect(await faithful(source, out.plan)).toEqual([]);
  return out.plan;
};

const suggested = (plan: SplitPlan): SplitPlan["groups"] => plan.groups.filter((g) => ["T5", "T6"].includes(g.tier));

describe("an overview of the order lifecycle", () => {
  test("lands near its target, not far below it", async () => {
    const plan = await planOf(ORDERS);
    expect(plan.overviewNodes).toBeLessThanOrEqual(HIGH.node_target);
    expect(plan.overviewNodes).toBeGreaterThanOrEqual(Math.ceil(EVEN_SHARE * HIGH.node_target));
  });

  test("keeps every hub as its own node", async () => {
    const plan = await planOf(ORDERS);
    const hubs = hubsOf(await workOf(ORDERS));
    expect(hubs.size).toBeGreaterThan(0);
    expect(suggested(plan).flatMap((g) => g.members.filter((m) => hubs.has(m)))).toEqual([]);
  });

  test("never groups a decision's branches that do not rejoin", async () => {
    const plan = await planOf(ORDERS);
    const work = await workOf(ORDERS);
    expect(suggested(plan).filter((g) => splitsBranches(work, g.members))).toEqual([]);
  });

  test("hides two nodes or more in every suggested group", async () => {
    const plan = await planOf(ORDERS);
    expect(suggested(plan).length).toBeGreaterThan(0);
    expect(suggested(plan).filter((g) => g.members.length < 3)).toEqual([]);
  });
});

// A GitOps pipeline whose application-controller is a hub the walk may fold.
// Its overlays reach the repo-server by three differently labelled links, so
// the Argo CD region's detail draws all three and does not split again.
const GITOPS = lines(
  "flowchart LR",
  "  dev --> pr --> review --> merge",
  "  subgraph ci",
  "    build --> test --> push --> bump",
  "  end",
  "  merge --> build",
  "  subgraph cfg",
  "    base --> ovdev",
  "    base --> ovstg",
  "    base --> ovprd",
  "  end",
  "  bump --> ovdev",
  "  subgraph argocd",
  "    repo",
  "    ctrl",
  "    apisrv",
  "    dex",
  "    redis",
  "    notif",
  "    appset",
  "  end",
  "  ovdev -->|dev| repo",
  "  ovstg -->|staging| repo",
  "  ovprd -->|prod| repo",
  "  repo --> ctrl",
  "  ctrl --> redis",
  "  apisrv --> redis",
  "  apisrv --> dex",
  "  appset --> ctrl",
  "  ctrl --> notif",
  "  subgraph clusters",
  "    kdev",
  "    kstg",
  "    kprd",
  "  end",
  "  ctrl --> kdev",
  "  ctrl --> kstg",
  "  ctrl --> kprd",
  "  notif --> slack",
  "  notif --> gh",
  "  kprd --> rollouts --> prom",
  "  prom -->|fail| abort",
  "  prom -->|pass| promote",
  "  ops --> apisrv",
);

describe("a group hiding one node", () => {
  test("is undone when the target holds without it, so evening never leaves one", async () => {
    const ring = Array.from({ length: 24 }, (_, i) => `  n${i} --> n${(i + 1) % 24}`);
    const chords = Array.from({ length: 12 }, (_, i) => `  n${i * 2} --> n${(i * 2 + 5) % 24}`);
    const plan = await planOf(lines("flowchart LR", ...ring, ...chords), target(18, 30));
    expect(suggested(plan).filter((g) => g.members.length < 3)).toEqual([]);
  });

  test("never stays beside the author regions a hub sits in, folded whole", async () => {
    const plan = await planOf(GITOPS, configFromPreset("low-density"));
    const hubs = hubsOf(await workOf(GITOPS));
    expect(hubs.has("ctrl")).toBe(true);
    const regions = plan.groups.flatMap((g) => g.regions).sort();
    expect(regions).toEqual(["argocd", "cfg", "ci", "clusters"]);
    expect(suggested(plan).filter((g) => g.members.length < 3)).toEqual([]);
  });
});

describe("naming a suggested group", () => {
  test("after the member with the most edges crossing its boundary, not the highest degree", async () => {
    const work = await workOf(
      lines(
        "flowchart LR",
        "  s --> i1",
        "  i1 --> t",
        "  i1 --> m",
        "  m --> i2",
        "  m --> i3",
        "  m --> i4",
        "  u --> m",
      ),
    );
    expect(rankedMembers(work, { members: ["i1", "i2", "i3", "i4", "m"], tier: "T6" })[0]).toBe("i1");
    expect(rankedMembers(work, { members: ["i1", "i2", "i3", "i4", "m"], tier: "T4" })[0]).toBe("m");
  });

  test("ties go to the member the flow reaches first", async () => {
    const work = await workOf(lines("flowchart LR", "  s --> q", "  q --> p", "  p --> t"));
    expect(rankedMembers(work, { members: ["p", "q"], tier: "T5" })[0]).toBe("q");
  });
});

// Two author regions joined by two links, the second written the other way.
const twoWay = (link: string): string =>
  lines(
    "flowchart LR",
    "  subgraph A",
    "    a1 --> a2 --> a3",
    "  end",
    "  subgraph B",
    "    b1 --> b2 --> b3",
    "  end",
    `  a1 ${link} b1`,
    `  b3 ${link} a3`,
    "  x --> y --> z --> w",
  );

describe("an undirected edge written both ways between two overview nodes", () => {
  test("is drawn once in the overview, declared, and recovered from the details", async () => {
    const plan = await planOf(twoWay("---"), target(6, 20));
    const between = plan.overview.edges.filter((e) => e.source.startsWith("g") && e.target.startsWith("g"));
    expect(between.map((e) => e.kind)).toEqual(["---"]);
    expect(plan.loss.reversedEdges).toBe(1);
  });

  test("is drawn twice when it has a direction", async () => {
    const plan = await planOf(twoWay("-->"), target(6, 20));
    const between = plan.overview.edges.filter((e) => e.source.startsWith("g") && e.target.startsWith("g"));
    expect(between).toHaveLength(2);
    expect(plan.loss.reversedEdges).toBe(0);
  });

  test("the contract rejects a wrong declared count", async () => {
    const build = await buildOf(twoWay("---"), target(6, 20));
    expect(await checkContract(build, target(6, 20))).toEqual([]);
    const broken = structuredClone(build);
    broken.plan.loss.reversedEdges = 0;
    const violations = await checkContract(broken, target(6, 20));
    expect(violations).toContain("2: the declared edges drawn the other way are wrong");
    expect((await faithful(twoWay("---"), broken.plan)).length).toBeGreaterThan(0);
  });

  test("the contract and the reading reject a directed edge drawn the other way", async () => {
    const build = await buildOf(twoWay("-->"), target(6, 20));
    const broken = structuredClone(build);
    const [keep, drop] = broken.plan.overview.edges.filter((e) => e.source.startsWith("g") && e.target.startsWith("g"));
    if (!(keep && drop)) throw new Error("no two edges between groups");
    broken.covers[keep.id] = [...(broken.covers[keep.id] ?? []), ...(broken.covers[drop.id] ?? [])];
    broken.plan.overview.edges = broken.plan.overview.edges.filter((e) => e !== drop);
    broken.plan.overviewSource = broken.plan.overviewSource.replace(`\n  ${drop.source} --> ${drop.target}`, "");
    broken.plan.loss.reversedEdges = 1;
    expect((await checkContract(broken, target(6, 20))).some((v) => v.startsWith("2:"))).toBe(true);
    expect((await faithful(twoWay("-->"), broken.plan)).length).toBeGreaterThan(0);
  });
});
