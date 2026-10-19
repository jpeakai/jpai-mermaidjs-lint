// What the round-11 blind rating held plans to (MJL-0033): a star of leaves
// no structure sorts is refused, and a tangled erDiagram overview folds its
// aggregates even when dropping rows alone meets the target.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { STAR, splitOutcome } from "../../src/split/index.ts";
import { tangled } from "../../src/split/plan.ts";
import { EMPTY_PARTITION } from "../../src/split/quotient.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { workOf } from "./helpers.ts";

const SLOW = 30_000;
const read = (name: string): string => readFileSync(join(import.meta.dir, "cases", "round11", `${name}.mmd`), "utf8");

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

describe("a star of leaves", () => {
  test(
    "no label, shape or neighbour sorts is refused, not cut into alphabetical buckets",
    async () => {
      const out = await splitOutcome(read("flow06-gateway-hub-spoke"), configFromPreset("medium"));
      expect(out).toEqual({ plan: null, reason: STAR, violations: [] });
    },
    SLOW,
  );
});

describe("an erDiagram overview", () => {
  test("is tangled when it meets a cycle for every four nodes", async () => {
    expect(tangled(await workOf(read("er06-university")), EMPTY_PARTITION)).toBe(true);
    expect(tangled(await workOf(read("er08-wordpress")), EMPTY_PARTITION)).toBe(false);
  });

  test(
    "met by dropping rows alone still folds aggregates when it is tangled",
    async () => {
      const plan = await planOf(read("er06-university"), "high");
      expect(plan.tier).toBe("T4");
      expect(plan.overviewNodes).toBeLessThan(23);
      expect(plan.overviewNodes).toBeGreaterThanOrEqual(15);
      expect(plan.groups.every((g) => g.reason === "aggregate root")).toBe(true);
      expect(plan.groups.some((g) => g.members.includes("FACULTY") && g.members.includes("COURSE"))).toBe(true);
    },
    SLOW,
  );

  test(
    "met by dropping rows alone stays as it is when it reads as a tree",
    async () => {
      const plan = await planOf(read("er08-wordpress"), "low");
      expect(plan.tier).toBe("T1");
      expect(plan.groups).toEqual([]);
    },
    SLOW,
  );

  test(
    "met with one small aggregate keeps folding aggregates that take away an edge per entity",
    async () => {
      const plan = await planOf(read("er04-sakila"), "medium");
      expect(plan.overviewNodes).toBeLessThan(15);
      expect(plan.overviewNodes).toBeGreaterThanOrEqual(9);
      expect(plan.loss.newReachablePairs).toBe(0);
      expect(plan.groups.length).toBeGreaterThan(1);
    },
    SLOW,
  );
});
