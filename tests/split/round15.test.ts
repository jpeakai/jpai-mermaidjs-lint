// What the round-15 blind rating held plans to (MJL-0037): a leaf fold that
// saves alike keeps groups even, so the compiler's nested Ast overview keeps
// Node and names "Expression (+3)"; stubs for two or more members of one
// group draw inside one box showing that group's label; and edges joining
// two groups one way are drawn exactly by the detail that needs fewer stubs,
// or with as many by the one meeting fewer outside nodes.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
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

const serious = async (source: string, plan: SplitPlan): Promise<string[]> => [
  ...(await faithful(source, plan)),
  ...(await checkPlan(source, plan, LOW, "")).filter((f) => f.sev === "BUG" || f.sev === "AMBIG").map((f) => f.msg),
];

const detailOf = (plan: SplitPlan, member: string): SplitDetail => {
  const g = plan.groups.find((x) => x.members.includes(member));
  const d = plan.details.find((x) => x.group === g?.id);
  if (!d) throw new Error(`no detail holds ${member}`);
  return d;
};

const stubLabels = (d: SplitDetail): string[] =>
  d.graph.nodes.filter((n) => d.stubs[n.id] !== undefined).map((n) => n.label);

const FLOW09 = read("round15", "flow09-subgraph-endpoints");

describe("a leaf fold saving alike", () => {
  test(
    "keeps groups even, so the nested Ast overview keeps Node and names Expression's family",
    async () => {
      const { plan } = await buildOf(read("round13", "class04-compiler-ast"), "low");
      const split = detailOf(plan, "SourceFile").split;
      expect(split?.overview.nodes.some((n) => n.id === "Node")).toBe(true);
      expect(split?.groups.map((g) => g.label)).toContain("Expression (+3)");
      expect(split?.loss.newReachablePairs).toBe(0);
    },
    SLOW,
  );
});

describe("a box of stubs", () => {
  test(
    "draws the members of one group inside one box showing its label",
    async () => {
      const { plan } = await buildOf(FLOW09, "low");
      const playback = detailOf(plan, "manifest");
      const [box] = playback.graph.subgraphs.filter((s) => playback.stubs[s.id] !== undefined);
      expect(box?.label).toBe("Edge tier (+2)");
      // The Edge tier stands for its region whole, so the edge to the region meets the box.
      expect(playback.stubs[box?.id ?? ""]).toBe("edge");
      const inside = playback.graph.nodes.filter((n) => n.parent === box?.id).map((n) => n.label);
      expect(inside.sort()).toEqual(["Open Connect appliance", "Zuul edge proxy"]);
      expect(await serious(FLOW09, plan)).toEqual([]);
    },
    SLOW,
  );

  test(
    "is refused by the contract and both readers when it names another group",
    async () => {
      const built = await buildOf(FLOW09, "low");
      const broken = structuredClone(built);
      const d = detailOf(broken.plan, "manifest");
      const box = d.graph.subgraphs.find((s) => d.stubs[s.id] !== undefined);
      if (!box) throw new Error("no box");
      d.source = d.source.replace(`["${box.label}"]`, '["Data platform (+3)"]');
      box.label = "Data platform (+3)";
      expect((await checkContract(broken, LOW)).some((v) => v.startsWith("5: box"))).toBe(true);
      expect((await serious(FLOW09, broken.plan)).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  test(
    "is refused when a stub inside it names another member",
    async () => {
      const built = await buildOf(FLOW09, "low");
      const broken = structuredClone(built);
      const d = detailOf(broken.plan, "manifest");
      const zuul = d.graph.nodes.find((n) => n.label === "Zuul edge proxy");
      if (!zuul) throw new Error("no stub for zuul");
      d.source = d.source.replace('(["Zuul edge proxy"])', '(["Open Connect appliance"])');
      zuul.label = "Open Connect appliance";
      expect((await checkContract(broken, LOW)).some((v) => v.includes("in box"))).toBe(true);
      expect((await serious(FLOW09, broken.plan)).length).toBeGreaterThan(0);
    },
    SLOW,
  );
});

describe("edges joining two groups one way", () => {
  test(
    "are drawn exactly by the detail meeting fewer outside nodes when both need as many stubs",
    async () => {
      const { plan } = await buildOf(FLOW09, "low");
      const edge = detailOf(plan, "zuul");
      expect(stubLabels(edge).filter((l) => l.includes(" (in "))).toEqual([]);
      expect(stubLabels(edge)).toHaveLength(5);
      for (const member of ["rows", "profile"]) {
        const d = detailOf(plan, member);
        expect(d.graph.subgraphs.map((s) => s.label)).toContain("Edge tier (+2)");
        expect(stubLabels(d)).toContain("Zuul edge proxy");
      }
    },
    SLOW,
  );

  test(
    "are drawn by the target when it needs stubs for fewer members than the source",
    async () => {
      const { plan } = await buildOf(read("round9", "flow01-online-boutique"), "medium");
      const checkout = detailOf(plan, "checkout");
      expect(stubLabels(checkout).filter((l) => l.includes("(in Carrier quote API"))).toEqual([]);
      const carrier = detailOf(plan, "carrier");
      expect(carrier.graph.subgraphs.map((s) => s.label)).toContain("Checkout domain (+5)");
    },
    SLOW,
  );
});
