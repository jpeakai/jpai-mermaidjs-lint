// What the round-19 changes hold plans to (MJL-0041): a decision region
// folded far larger than the other groups opens, its decision kept in view
// and the regions inside it folded apart; a span label holds both its labels
// whole up to twice the label cap; and a stub for the first or last member a
// range label names shows its own label. The contract and both test readers
// refuse a forged span label.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { groupLabels, LABEL_CAP, ownSuffices, rangeEnds, SPAN_CAP, spanLabel } from "../../src/split/label.ts";
import { laddersOf, OVERSIZED, oversized, planWork } from "../../src/split/plan.ts";
import { partitionOf } from "../../src/split/quotient.ts";
import type { SplitDetail, SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { workOf } from "./helpers.ts";

const SLOW = 60_000;
const CASES = join(import.meta.dir, "cases");
const read = (set: string, name: string): string => readFileSync(join(CASES, set, `${name}.mmd`), "utf8");

const buildOf = async (source: string, preset: string): Promise<Build> => {
  const work = await workOf(source);
  const built = planWork(work, configFromPreset(preset), 1, laddersOf(work)[0]);
  if (typeof built === "string") throw new Error(built);
  expect(await checkContract(built, configFromPreset(preset))).toEqual([]);
  return built;
};

const serious = async (source: string, plan: SplitPlan, preset: string): Promise<string[]> => [
  ...(await faithful(source, plan)),
  ...(await checkPlan(source, plan, configFromPreset(preset), ""))
    .filter((f) => f.sev === "BUG" || f.sev === "AMBIG")
    .map((f) => f.msg),
];

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
  for (const d of broken.plan.details) {
    d.source = swap(d.source);
    for (const n of d.graph.nodes) if (n.label === g.label) n.label = label;
    for (const s of d.graph.subgraphs) if (s.label === g.label) s.label = label;
  }
  Object.assign(g, { label, ...patch });
  return broken;
};

const refused = async (source: string, forged: Build, preset: string): Promise<void> => {
  expect((await checkContract(forged, configFromPreset(preset))).some((v) => v.startsWith("4:"))).toBe(true);
  expect((await faithful(source, forged.plan)).length).toBeGreaterThan(0);
  const read = await checkPlan(source, forged.plan, configFromPreset(preset), "");
  expect(read.some((f) => f.sev === "BUG" && f.kind === "glabel")).toBe(true);
};

const largest = (plan: SplitPlan): number => Math.max(...plan.groups.map((g) => g.members.length));

describe("a decision region folded far larger than the other groups", () => {
  test.each(["medium", "high"])(
    "opens in a loan flow at %s, its decision in view and the scoring regions apart",
    async (preset) => {
      const source = read("round19", "flow04-loan-decisions");
      const { plan } = await buildOf(source, preset);
      // The thin-file decision shows, and neither scoring branch folds with the other.
      expect(plan.groups.some((g) => g.members.includes("thin"))).toBe(false);
      expect(plan.overview.nodes.some((n) => n.label === "Thin file?")).toBe(true);
      const alt = plan.groups.find((g) => g.members.includes("alt"));
      const bureau = plan.groups.find((g) => g.members.includes("score"));
      expect(alt && bureau && alt !== bureau).toBe(true);
      expect(largest(plan)).toBeLessThanOrEqual(7);
      expect(oversized(partitionOf(plan.groups.map((g) => ({ ...g }))))).toBeUndefined();
      expect(plan.overviewNodes).toBeLessThanOrEqual(configFromPreset(preset).node_target);
      expect(plan.loss.newReachablePairs).toBe(0);
      expect(await serious(source, plan, preset)).toEqual([]);
    },
    SLOW,
  );

  test("is a decision region holding more than twice the median group's members", () => {
    const g = (members: string[], reason = "chain stage", head?: string) => ({
      members,
      regions: [],
      parent: null,
      tier: "T2" as const,
      reason,
      ...(head ? { head } : {}),
    });
    const big = g(["a1", "a2", "a3", "a4", "a5", "a6", "a7"], "decision region", "a1");
    const small = [g(["b1", "b2", "b3"]), g(["c1", "c2", "c3"]), g(["d1", "d2"])];
    expect(OVERSIZED).toBe(2);
    expect(oversized(partitionOf([big, ...small]))?.head).toBe("a1");
    // As large, but not a decision region, or among two groups only: it stays.
    expect(oversized(partitionOf([{ ...big, reason: "chain stage" }, ...small]))).toBeUndefined();
    expect(oversized(partitionOf([big, small[0] as (typeof small)[number]]))).toBeUndefined();
    // Twice the median and no more: it stays.
    const six = g(["a1", "a2", "a3", "a4", "a5", "a6"], "decision region", "a1");
    expect(oversized(partitionOf([six, ...small]))).toBeUndefined();
  });
});

describe("a span label longer than the label cap", () => {
  test(
    "names a loan flow's sanctions stage whole, and is refused forged",
    async () => {
      const source = read("round19", "flow04-loan-decisions");
      const built = await buildOf(source, "low");
      const { plan } = built;
      const stage = plan.groups.find((g) => g.members.includes("sanctions"));
      expect(stage?.label).toBe("Sanctions list hit? → Pull credit bureau file (+3)");
      expect(stage?.spanned).toBe(true);
      expect(stage?.labelBase.length).toBeGreaterThan(LABEL_CAP);
      // The overview shows it uncut.
      expect(plan.overviewSource).toContain('"Sanctions list hit? → Pull credit bureau file (+3)"');
      expect(await serious(source, plan, "low")).toEqual([]);
      await refused(
        source,
        relabel(built, "sanctions", "Sanctions list hit? → Refer to compliance (+3)", {
          labelBase: "Sanctions list hit? → Refer to compliance",
        }),
        "low",
      );
      // Cut as a long label would be, it no longer reads as its ends.
      await refused(
        source,
        relabel(built, "sanctions", "Sanctions list hit? → Pull…bureau file (+3)", {
          labelBase: "Sanctions list hit? → Pull credit bureau file",
        }),
        "low",
      );
    },
    SLOW,
  );

  test(
    "keeps an incident flow's stages named as before, its new span shown whole",
    async () => {
      const source = read("round19", "flow14-incident-response");
      const { plan } = await buildOf(source, "low");
      const labels = plan.groups.map((g) => g.label);
      expect(labels).toContain("Alert fires → Triage impact (+4)");
      expect(labels).toContain("Open low-priority ticket (+Close alert)");
      expect(labels).toContain("More than 10% of users? → Assign scribe and comms lead (+4)");
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );
});

describe("a span label's cap", () => {
  test("holds at most twice the label cap, both labels whole", () => {
    expect(SPAN_CAP).toBe(2 * LABEL_CAP);
    expect(spanLabel("Watch SLO burn rate 15 min", "Watch SLO burn rate 30 min")).toBe(
      "Watch SLO burn rate 15 min → Watch SLO burn rate 30 min",
    );
    expect(spanLabel("a".repeat(40), "b".repeat(38))).toBeNull();
    expect(groupLabels({ base: "a → b", n: 3, span: true }, "g1")).toEqual(["a → b (+3)", "a → b (+3) [g1]"]);
    const long = `${"a".repeat(30)} → ${"b".repeat(30)}`;
    expect(groupLabels({ base: long, n: 3, span: true }, "g1")[0]).toBe(`${long} (+3)`);
  });
});

describe("a stub for a member a range label names", () => {
  test(
    "shows its own label, and any other member keeps its group's label",
    async () => {
      const source = read("round9", "flow12-id-like-labels");
      const { plan } = await buildOf(source, "medium");
      const shown = plan.details.flatMap(stubLabels);
      expect(shown).toContain("REL-0042");
      expect(shown.some((t) => t.startsWith("REL-0042 (in "))).toBe(false);
      expect(shown.some((t) => t.startsWith("PLAT-1240 (in "))).toBe(false);
      expect(shown).toContain("WEB-2215 (in WEB-2210 … WEB-2216 (+4))");
      expect(await serious(source, plan, "medium")).toEqual([]);
    },
    SLOW,
  );

  test("reads the range's two ends, and only a range's", () => {
    expect(rangeEnds("REL-0042 … REL-0044")).toEqual(["REL-0042", "REL-0044"]);
    expect(rangeEnds("Release train")).toEqual([]);
    const g = { label: "REL-0042 … REL-0044 (+1)", base: "REL-0042 … REL-0044" };
    expect(ownSuffices(g, "REL-0042", false)).toBe(true);
    expect(ownSuffices(g, "REL-0044", false)).toBe(true);
    expect(ownSuffices(g, "REL-0043", false)).toBe(false);
    expect(ownSuffices(g, "REL-0042", true)).toBe(false);
  });
});
