// What the round-11 blind rating held plans to (MJL-0033): a star of leaves
// no structure sorts is refused, and a tangled erDiagram overview folds its
// aggregates even when dropping rows alone meets the target, and a ticket
// graph folds each id family whole, and regions drawn from one template fold
// alike, named apart by the region around them.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { checkContract } from "../../src/split/contract.ts";
import { STAR, splitOutcome } from "../../src/split/index.ts";
import { tangled } from "../../src/split/plan.ts";
import { EMPTY_PARTITION } from "../../src/split/quotient.ts";
import { echoesOf } from "../../src/split/tier3.ts";
import { ID_FAMILY } from "../../src/split/tier6.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { buildOf, workOf } from "./helpers.ts";

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

describe("an id family", () => {
  test(
    "folds whole, hubs and all, so no family is scattered and no node is left loose",
    async () => {
      const source = readFileSync(join(import.meta.dir, "cases", "round9", "flow12-id-like-labels.mmd"), "utf8");
      const plan = await planOf(source, "medium");
      const families = plan.groups.map((g) => new Set(g.members.map((m) => m.split("-")[0])));
      expect(families.every((f) => f.size === 1)).toBe(true);
      expect(new Set(families.map((f) => [...f][0])).size).toBe(plan.groups.length);
      expect(plan.groups.every((g) => g.reason === ID_FAMILY)).toBe(true);
      expect(plan.overviewNodes).toBe(plan.groups.length);
      expect(plan.loss.newReachablePairs).toBe(0);
    },
    SLOW,
  );
});

describe("echoing regions", () => {
  test("are siblings of one shape and their children of one label", async () => {
    const work = await workOf(read("flow02-multiregion-nested"));
    expect(echoesOf(work, "use1")).toEqual(["euw1"]);
    expect(echoesOf(work, "use1pub")).toEqual(["euw1pub"]);
    expect(echoesOf(work, "euw1data")).toEqual(["use1data"]);
    expect(echoesOf(work, "shared")).toEqual([]);
  });

  test(
    "fold to the same depth, named apart by the region each sits in, with no new reachable pair",
    async () => {
      const plan = await planOf(read("flow02-multiregion-nested"), "high");
      const labels = plan.groups.map((g) => g.label);
      for (const sub of ["Public subnets", "App subnets", "Data subnets"])
        for (const region of ["us-east-1", "eu-west-1"])
          expect(labels.some((l) => l.startsWith(`${sub} (${region}) (+`))).toBe(true);
      expect(plan.details.every((d) => d.split === null)).toBe(true);
      expect(plan.loss.newReachablePairs).toBe(0);
    },
    SLOW,
  );

  test(
    "take a qualified label only from the region the group node sits in, as every reader checks",
    async () => {
      const source = read("flow02-multiregion-nested");
      const cfg = configFromPreset("high");
      const out = await splitOutcome(source, cfg);
      if (!out.plan) throw new Error(out.reason);
      const build = await buildOf(source, cfg);
      const g = build.plan.groups.find((x) => x.labelBase === "Public subnets (us-east-1)");
      if (!g) throw new Error("no qualified group");
      const wrong = "Public subnets (AWS organisation)";
      const broken = structuredClone(build);
      const bg = broken.plan.groups.find((x) => x.id === g.id);
      if (!bg) throw new Error("no group");
      bg.labelBase = wrong;
      bg.label = `${wrong} (+${g.hidden})`;
      broken.plan.overviewSource = broken.plan.overviewSource.replace(g.label, bg.label);
      expect(await checkContract(broken, cfg)).toContain(`4: group ${g.id} label "${wrong}" is not from the data`);
      expect((await faithful(source, broken.plan)).some((p) => p.includes(`group ${g.id} label`))).toBe(true);
      const found = await checkPlan(source, broken.plan, cfg, "");
      expect(found.some((f) => f.sev === "BUG" && f.kind === "glabel")).toBe(true);
      const counted = structuredClone(build);
      const cg = counted.plan.groups.find((x) => x.id === g.id);
      if (!cg) throw new Error("no group");
      cg.hidden -= 1;
      cg.label = `${g.labelBase} (+${cg.hidden})`;
      counted.plan.overviewSource = counted.plan.overviewSource.replace(g.label, cg.label);
      expect(await checkContract(counted, cfg)).toContain(`4: group ${g.id} counts ${cg.hidden} hidden members`);
      expect((await faithful(source, counted.plan)).some((p) => p.includes(`group ${g.id} label`))).toBe(true);
      expect((await checkPlan(source, counted.plan, cfg, "")).some((f) => f.kind === "glabel")).toBe(true);
    },
    SLOW,
  );
});
