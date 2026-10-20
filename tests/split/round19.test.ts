// What the round-19 change holds plans to (MJL-0041): a stub for the first or
// last member a range label names shows its own label. The loan and incident
// flows rated in round 19 keep the round-18 plans: a span label holds at most
// LABEL_CAP characters, and a decision region folds whole however large.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { LABEL_CAP, ownSuffices, rangeEnds, spanLabel } from "../../src/split/label.ts";
import { laddersOf, planWork } from "../../src/split/plan.ts";
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
    // A range shown cut names no end whole, so its ends keep the group's label.
    expect(ownSuffices({ label: "REL-0042 … R…44 (+1)", base: "REL-0042 … REL-0044" }, "REL-0042", false)).toBe(false);
  });
});

describe("the flows rated in round 19 keep their round-18 plans", () => {
  test("a span label holds at most LABEL_CAP characters", () => {
    expect(spanLabel("Watch SLO burn rate 15 min", "Watch SLO burn rate 30 min")).toBeNull();
    expect(spanLabel("Alert fires", "Triage impact")).toBe("Alert fires → Triage impact");
  });

  test.each(["low", "medium", "high"])(
    "a loan flow at %s folds its thin-file region whole and names no span over the cap",
    async (preset) => {
      const source = read("round19", "flow04-loan-decisions");
      const { plan } = await buildOf(source, preset);
      for (const g of plan.groups.filter((x) => x.spanned)) expect(g.labelBase.length).toBeLessThanOrEqual(LABEL_CAP);
      if (preset !== "low") expect(plan.groups.some((g) => g.members.includes("thin"))).toBe(true);
      expect(await serious(source, plan, preset)).toEqual([]);
    },
    SLOW,
  );

  test(
    "an incident flow names its stages as in round 18",
    async () => {
      const source = read("round19", "flow14-incident-response");
      const { plan } = await buildOf(source, "low");
      const labels = plan.groups.map((g) => g.label);
      expect(labels).toContain("Alert fires → Triage impact (+4)");
      expect(labels).toContain("Open low-priority ticket (+Close alert)");
      expect(labels.some((l) => l.startsWith("More than 10% of users? →"))).toBe(false);
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );
});
