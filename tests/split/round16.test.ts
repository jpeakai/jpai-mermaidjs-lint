// What the round-16 blind rating held plans to (MJL-0038): twin chains fold
// whole, never cut into runs, their detail split again into one group per
// lane; a lane's place may be named by the two words its labels lead with; a
// group of two members names both, as "ROOM (+BUILDING)", and a stub for
// either shows its own label; a group holding every leaf one overview node
// leads to is named by that node, as "Checkout domain → …", until MJL-0040
// listed every member where the list fits. A tangled
// schema that meets its target by rows alone folded its aggregates, until
// MJL-0039 left it at rows dropped.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { laneLabel, pairLabel } from "../../src/split/label.ts";
import { laddersOf, planWork } from "../../src/split/plan.ts";
import type { SplitDetail, SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { workOf } from "./helpers.ts";

const SLOW = 60_000;
const CASES = join(import.meta.dir, "cases");
const read = (set: string, name: string): string => readFileSync(join(CASES, set, `${name}.mmd`), "utf8");
const LOW = configFromPreset("low");

const buildOf = async (source: string, preset: string): Promise<Build> => {
  const work = await workOf(source);
  const built = planWork(work, configFromPreset(preset), 1, laddersOf(work)[0]);
  if (typeof built === "string") throw new Error(built);
  expect(await checkContract(built, configFromPreset(preset))).toEqual([]);
  return built;
};

const serious = async (source: string, plan: SplitPlan, preset = "low"): Promise<string[]> => [
  ...(await faithful(source, plan)),
  ...(await checkPlan(source, plan, configFromPreset(preset), ""))
    .filter((f) => f.sev === "BUG" || f.sev === "AMBIG")
    .map((f) => f.msg),
];

const detailOf = (plan: SplitPlan, member: string): SplitDetail => {
  const g = plan.groups.find((x) => x.members.includes(member));
  const d = plan.details.find((x) => x.group === g?.id);
  if (!d) throw new Error(`no detail holds ${member}`);
  return d;
};

const stubLabels = (d: SplitDetail): string[] =>
  d.graph.nodes.filter((n) => d.stubs[n.id] !== undefined).map((n) => n.label);

// A copy of the build with one group's shown label replaced everywhere the
// plan writes it, as a forged plan would read.
const relabel = (built: Build, member: string, label: string, patch: Partial<SplitPlan["groups"][number]>): Build => {
  const broken = structuredClone(built);
  const g = broken.plan.groups.find((x) => x.members.includes(member));
  if (!g) throw new Error(`no group holds ${member}`);
  const swap = (s: string): string => s.split(`"${g.label}"`).join(`"${label}"`);
  broken.plan.overviewSource = swap(broken.plan.overviewSource);
  for (const n of broken.plan.overview.nodes) if (n.id === g.id) n.label = label;
  for (const d of broken.plan.details) d.source = swap(d.source);
  Object.assign(g, { label, ...patch });
  return broken;
};

const FLOW05 = read("round9", "flow05-etl-fanout-fanin");

describe("twin chains", () => {
  test(
    "fold whole, named by the two words their extracts lead with, their detail split into one group per lane",
    async () => {
      const { plan } = await buildOf(FLOW05, "low");
      const lanes = plan.groups.filter((g) => g.members.some((m) => m.startsWith("ex_")) && g.members.length > 2);
      expect(lanes.map((g) => g.label)).toEqual(["Extract/Ingest → bronze (+14)"]);
      const nested = detailOf(plan, "ex_pg").split;
      expect(nested?.groups.map((g) => g.members.length)).toEqual([2, 2, 2, 2, 2, 2, 2]);
      expect(nested?.loss.newReachablePairs).toBe(0);
      // Lanes folded alike read alike: none takes a pair label unless all can.
      expect(nested?.groups.every((g) => g.label.endsWith(" (+1)"))).toBe(true);
      // The lanes' detail is split again, so it draws the scheduler's edges into
      // them exactly, and the scheduler's detail draws the lanes as one stub.
      expect(stubLabels(detailOf(plan, "sched"))).toEqual(["Extract/Ingest → bronze (+14)", "Extract MySQL inventory"]);
      expect(await serious(FLOW05, plan)).toEqual([]);
    },
    SLOW,
  );

  test(
    "too many for one detail fold whole in a pipeline led by two verbs",
    async () => {
      const source = read("round16", "lanes-three-stages");
      const built = await buildOf(source, "low");
      const lanes = built.plan.groups.find((g) => g.members.includes("p1"));
      expect(lanes?.label).toBe("Fetch/Pull → raw (+16)");
      expect(detailOf(built.plan, "p1").split?.groups).toHaveLength(8);
      const forged = relabel(built, "p1", "Pull → raw (+16)", { labelBase: "Pull → raw" });
      expect((await checkContract(forged, LOW)).some((v) => v.startsWith("4:"))).toBe(true);
      expect((await serious(source, forged.plan)).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  test("name a place by two first words, else an ellipsis", () => {
    expect(
      laneLabel([
        ["Pull a", "raw.a"],
        ["Fetch b", "raw.b"],
        ["Pull c", "raw.c"],
      ]),
    ).toBe("Fetch/Pull → raw");
    expect(
      laneLabel([
        ["Pull a", "raw.a"],
        ["b", "raw.b"],
      ]),
    ).toBe("… → raw");
  });
});

describe("a pair label", () => {
  test(
    "names both members of each aggregate of two a schema folds",
    async () => {
      const source = read("round16", "pair-aggregates");
      const built = await buildOf(source, "low");
      const { plan } = built;
      const labels = plan.groups.map((g) => g.label);
      expect(labels).toContain("BOOK (+PUBLISHER)");
      expect(labels).toContain("LOAN (+RENEWAL)");
      // No entity's name is hidden from the overview.
      const shown = plan.overview.nodes.map((n) => n.label).join("\n");
      for (const name of ["PUBLISHER", "RENEWAL"]) expect(shown).toContain(name);
      // A stub for a member of a pair shows its own label.
      expect(plan.details.flatMap(stubLabels)).toContain("LOAN");
      expect(await serious(source, plan, "low")).toEqual([]);
      const forged = relabel(built, "BOOK", "BOOK (+RENEWAL)", { paired: "RENEWAL" });
      expect((await checkContract(forged, LOW)).some((v) => v.includes("pair label"))).toBe(true);
      expect((await serious(source, forged.plan, "low")).some((m) => m.includes("pair label"))).toBe(true);
    },
    SLOW,
  );

  test(
    "folds a library schema's closed aggregates where rows alone meet the target",
    async () => {
      // MJL-0039 folded none; since MJL-0040 the closed ones fold.
      const source = read("round16", "pair-aggregates");
      const { plan } = await buildOf(source, "medium");
      expect(plan.ladder.map((s) => s.tier)).toEqual(["T1", "T4"]);
      expect(plan.groups.map((g) => g.label).sort()).toEqual(["BOOK (+PUBLISHER)", "LOAN (+RENEWAL)"]);
      expect(await serious(source, plan, "medium")).toEqual([]);
    },
    SLOW,
  );

  test("is offered only whole, with no bracket, number or markup", () => {
    expect(pairLabel("ROOM", "BUILDING")).toBe("ROOM (+BUILDING)");
    expect(pairLabel("CART", "CART_ITEM")).toBe("CART (+CART_ITEM)");
    expect(pairLabel("Step", "2")).toBeNull();
    expect(pairLabel("Step", "Step")).toBeNull();
    expect(pairLabel("frontend (Go)", "cart")).toBeNull();
    expect(pairLabel("a", "<b>bold</b>")).toBeNull();
    expect(pairLabel("Great Expectations suite", "PagerDuty data on-call")).toBeNull();
  });
});

describe("a fan label", () => {
  test(
    "names the external APIs a domain calls by every member since MJL-0040, and refuses a forged fan label",
    async () => {
      const source = read("round9", "flow01-online-boutique");
      const built = await buildOf(source, "medium");
      const apis = built.plan.groups.find((g) => g.members.includes("carrier"));
      expect(apis?.label).toBe("Carrier quote API (+ECB rates feed, Payment provider API, SMTP relay)");
      expect(await serious(source, built.plan, "medium")).toEqual([]);
      const forged = relabel(built, "carrier", "Catalog domain → … (+4)", { labelBase: "Catalog domain → …" });
      expect((await checkContract(forged, LOW)).some((v) => v.startsWith("4:"))).toBe(true);
      expect((await serious(source, forged.plan, "medium")).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  test(
    "names the leaves one author region calls, and a pair of leaves by both",
    async () => {
      const source = read("round16", "fan-external-calls");
      const { plan } = await buildOf(source, "medium");
      const labels = plan.groups.map((g) => g.label);
      expect(labels).toContain("Order service → … (+5)");
      expect(labels).toContain("Mobile app (+Shopper)");
      expect(await serious(source, plan, "medium")).toEqual([]);
    },
    SLOW,
  );
});

describe("a stub for the member a group is named after", () => {
  test(
    "shows its own label alone, which leads the group's, and is refused when it names another node",
    async () => {
      const source = read("round9", "state08-jira-workflow-ids");
      const built = await buildOf(source, "low");
      const labels = built.plan.details.flatMap(stubLabels);
      expect(labels.filter((l) => /^(.*) \(in \1 \(\+\d+\)\)$/s.test(l))).toEqual([]);
      expect(labels).toContain("10010 Closed");
      expect(await serious(source, built.plan)).toEqual([]);
      const broken = structuredClone(built);
      const d = broken.plan.details.find((x) => x.graph.nodes.some((n) => n.label === "10010 Closed"));
      const stub = d?.graph.nodes.find((n) => n.label === "10010 Closed");
      if (!(d && stub)) throw new Error("no namesake stub");
      d.source = d.source.replace('"10010 Closed"', '"10012 Duplicate"');
      stub.label = "10012 Duplicate";
      expect((await checkContract(broken, LOW)).some((v) => v.startsWith("5:"))).toBe(true);
      expect((await serious(source, broken.plan)).length).toBeGreaterThan(0);
    },
    SLOW,
  );
});
