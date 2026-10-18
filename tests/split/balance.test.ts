// What the round-9 blind rating held plans to: an overview lands near its
// target rather than far below it, no one group swallows most of a diagram,
// a suggested group keeps to one id family, a plan leaves few relationships
// between two groups, and a detail never draws two stubs with one text.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { evenFloorOf } from "../../src/split/plan.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { faithful } from "./faithful.ts";
import { workOf } from "./helpers.ts";

const SLOW = 30_000;
const CASES = join(import.meta.dir, "cases", "round9");
const read = (name: string): string => readFileSync(join(CASES, `${name}.mmd`), "utf8");

const planOf = async (source: string, preset: string): Promise<SplitPlan> => {
  const out = await splitOutcome(source, configFromPreset(preset));
  expect(out.violations).toEqual([]);
  if (!out.plan) throw new Error(out.reason);
  expect(await faithful(source, out.plan)).toEqual([]);
  return out.plan;
};

describe("an overview lands near its target", () => {
  test(
    "a namespace folded greedily is given back when the overview would fall below the floor",
    async () => {
      const source = read("class04-compiler-ast");
      const plan = await planOf(source, "low-density");
      const floor = evenFloorOf(await workOf(source), configFromPreset("low-density"));
      expect(plan.overviewNodes).toBeGreaterThanOrEqual(floor);
    },
    SLOW,
  );
});

describe("no one group swallows most of a diagram", () => {
  test(
    "an aggregate over the target is never folded again into a larger one",
    async () => {
      const source = read("er01-ecommerce");
      const plan = await planOf(source, "low-density");
      const total = (await workOf(source)).ids.length;
      const largest = Math.max(...plan.groups.map((g) => g.members.length));
      expect(largest).toBeLessThanOrEqual(total / 2);
    },
    SLOW,
  );
});
