// What the round-14 blind rating held plans to (MJL-0036): a group holding a
// whole dotted family is named by it, twin chains are named by their stages,
// a stub for a member of a group names the group by the label the overview
// shows it with, so no stub reads "(in group)", and edges one member sends
// into several members of another group are drawn exactly in the target's
// detail, from one stub for that member.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { familyLabel, laneLabel } from "../../src/split/label.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";

const SLOW = 60_000;
const CASES = join(import.meta.dir, "cases");
const read = (name: string): string => readFileSync(join(CASES, "round13", `${name}.mmd`), "utf8");

const planOf = async (source: string, preset: string): Promise<SplitPlan> => {
  const cfg = configFromPreset(preset);
  const out = await splitOutcome(source, cfg);
  expect(out.violations).toEqual([]);
  if (!out.plan) throw new Error(out.reason);
  expect(await faithful(source, out.plan)).toEqual([]);
  const serious = (await checkPlan(source, out.plan, cfg, "")).filter((f) => f.sev === "BUG" || f.sev === "AMBIG");
  expect(serious).toEqual([]);
  return out.plan;
};

const serious = async (source: string, plan: SplitPlan): Promise<string[]> => [
  ...(await faithful(source, plan)),
  ...(await checkPlan(source, plan, configFromPreset("low"), ""))
    .filter((f) => f.sev === "BUG" || f.sev === "AMBIG")
    .map((f) => f.msg),
];

const stubTexts = (plan: SplitPlan): string[] =>
  plan.details.flatMap((d) => [
    ...d.graph.nodes.filter((n) => d.stubs[n.id] !== undefined).map((n) => n.label),
    ...(d.split ? stubTexts(d.split) : []),
  ]);

describe("a family label", () => {
  test("names a whole dotted family, and nothing less", () => {
    expect(familyLabel(["gold.a", "gold.b", "gold.c"], ["silver.a", "Publish"])).toBe("gold.*");
    // Another node of the family outside the group: the label would claim it.
    expect(familyLabel(["gold.a", "gold.b", "gold.c"], ["gold.d"])).toBeNull();
    expect(familyLabel(["gold.a", "gold.b"], [])).toBeNull();
    expect(familyLabel(["gold.a", "gold.b", "silver.c"], [])).toBeNull();
    expect(familyLabel(["Extract a", "Extract b", "Extract c"], [])).toBeNull();
  });
});

describe("a lane label", () => {
  test("names each stage by its namespace, shared first word or two first words, else an ellipsis", () => {
    expect(
      laneLabel([
        ["Extract GA4 events", "bronze.events"],
        ["Extract Stripe charges", "bronze.charges"],
      ]),
    ).toBe("Extract → bronze");
    expect(
      laneLabel([
        ["Extract Postgres orders", "bronze.orders"],
        ["Ingest partner SFTP drops", "bronze.partner_sales"],
      ]),
    ).toBe("Extract/Ingest → bronze");
    expect(
      laneLabel([
        ["Extract a", "bronze.a"],
        ["Ingest b", "bronze.b"],
        ["Load c", "bronze.c"],
      ]),
    ).toBe("… → bronze");
    expect(
      laneLabel([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBeNull();
    expect(laneLabel([["Extract a", "bronze.a"]])).toBeNull();
    expect(laneLabel([["Extract a", "bronze.a"], ["Extract b"]])).toBeNull();
  });
});

describe("an ETL pipeline at low density", () => {
  test(
    "names its gold tables by their family and its lanes by their stages",
    async () => {
      const source = read("flow05-etl-fanout-fanin");
      const plan = await planOf(source, "low");
      const gold = plan.groups.find((g) => g.members.includes("g_ltv"));
      expect(gold?.label).toBe("gold.* (+5)");
      const lanes = plan.groups.filter((g) => g.members.some((m) => m.startsWith("ex_"))).map((g) => g.labelBase);
      // Every lane folds into one group, named by the two words its extracts lead with (MJL-0038).
      expect(lanes).toEqual(["Extract/Ingest → bronze"]);
      // Silver is cut in two, so neither half claims the whole family.
      const silver = plan.groups.filter((g) => g.members.some((m) => m.startsWith("sv_")));
      for (const g of silver) expect(g.labelBase.endsWith(".*")).toBe(false);
      // The scheduler pair shows both names, so a stub for either reads as its own label.
      expect(plan.groups.map((g) => g.label)).toContain("Airflow daily 02:00 (+Start extract)");
      // Start extract alone feeds every lane, so each lane's detail draws it
      // exactly and the scheduler's detail draws each lane group as one stub.
      const sched = plan.details.find((d) => d.graph.nodes.some((n) => n.id === "extract_start"));
      const laneIds = new Set(plan.groups.filter((g) => g.members.some((m) => m.startsWith("ex_"))).map((g) => g.id));
      const ends = Object.values(sched?.stubs ?? {});
      expect(ends.filter((e) => laneIds.has(e))).toHaveLength(laneIds.size);
      expect(ends.filter((e) => e.startsWith("ex_") && e !== "ex_mysql")).toEqual([]);

      // A family label on a half of silver is caught by both readers.
      const half = silver[0];
      if (!half) throw new Error("no silver group");
      const forged = `silver.* (+${half.members.length})`;
      const swap = (s: string): string => s.split(`"${half.label}"`).join(`"${forged}"`);
      const broken: SplitPlan = {
        ...structuredClone(plan),
        overviewSource: swap(plan.overviewSource),
        details: plan.details.map((d) => ({ ...d, source: swap(d.source) })),
      };
      expect((await serious(source, broken)).some((m) => m.includes("silver.*"))).toBe(true);
    },
    SLOW,
  );
});

describe("a stub for a member of a group", () => {
  test(
    "names the group by its shown label, in a nested overview too",
    async () => {
      const plan = await planOf(read("er01-ecommerce"), "low");
      const texts = stubTexts(plan);
      expect(texts.filter((t) => t.endsWith(" (in group)"))).toEqual([]);
      // The member a group is named after shows its own label alone (MJL-0038).
      expect(texts).toContain("CUSTOMER");
      // A member of a group of three named by every member shows its own label alone (MJL-0039).
      expect(texts).toContain("PAYMENT_METHOD");
      expect(texts.some((t) => t.startsWith("PAYMENT_METHOD (in "))).toBe(false);
    },
    SLOW,
  );
});
