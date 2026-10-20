// What the round-13 blind rating held plans to (MJL-0035): an author region
// folds whole however much of the diagram it holds, its detail split again
// inside; between two groups joined both ways, the one whose detail is split
// again draws the other's members, so a nested overview names the member a
// reader is sent to; and a pipeline folds by lane, each extract with the
// bronze table it lands in.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { exactSide, keyOf, partitionOf } from "../../src/split/quotient.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { workOf } from "./helpers.ts";

const SLOW = 60_000;
const CASES = join(import.meta.dir, "cases");
const read = (name: string): string => readFileSync(join(CASES, "round13", `${name}.mmd`), "utf8");
const lines = (...xs: string[]): string => xs.join("\n");

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

const groupOf = (plan: SplitPlan, member: string) => {
  const g = plan.groups.find((x) => x.members.includes(member));
  if (!g) throw new Error(`no group holds ${member}`);
  return g;
};

const detailOf = (plan: SplitPlan, member: string) => {
  const g = groupOf(plan, member);
  const d = plan.details.find((x) => x.group === g.id);
  if (!d) throw new Error(`no detail for ${g.id}`);
  return d;
};

describe("an author region holding most of a diagram", () => {
  test(
    "folds whole, its detail split again inside the region",
    async () => {
      const plan = await planOf(read("class04-compiler-ast"), "low");
      const ast = groupOf(plan, "SourceFile");
      expect(ast.labelBase).toBe("Ast");
      expect(ast.members).toHaveLength(13);
      expect(ast.reason).toBe("author region");
      const split = detailOf(plan, "SourceFile").split;
      expect(split?.groups.length).toBeGreaterThan(1);
      expect(split?.loss.newReachablePairs).toBe(0);
      expect(plan.loss.newReachablePairs).toBeLessThanOrEqual(2);
    },
    SLOW,
  );

  test(
    "folds whole when nothing else would plan it too",
    async () => {
      const source = readFileSync(join(CASES, "round3", "f01-nested-empty-onenode-regions.mmd"), "utf8");
      const plan = await planOf(source, "low");
      expect(plan.groups.some((g) => g.labelBase === "Outer zone")).toBe(true);
    },
    SLOW,
  );
});

describe("two groups joined both ways", () => {
  test(
    "the group split again names the other's members, and the other draws it whole",
    async () => {
      const plan = await planOf(read("er01-ecommerce"), "low");
      const [order, customer] = [groupOf(plan, "ORDER"), groupOf(plan, "CUSTOMER")];
      const nested = detailOf(plan, "ORDER");
      expect(nested.split).not.toBeNull();
      const ends = Object.values(nested.stubs);
      expect(ends).toContain("PAYMENT_METHOD");
      expect(ends).toContain("CUSTOMER");
      expect(ends).not.toContain(customer.id);
      const flat = detailOf(plan, "CUSTOMER");
      expect(flat.split).toBeNull();
      expect(Object.values(flat.stubs)).toContain(order.id);
      expect(Object.values(flat.stubs).filter((e) => order.members.includes(e))).toEqual([]);
    },
    SLOW,
  );

  test("the side split again wins over the side needing fewer stubs, else that rule holds", async () => {
    // A's member a1 reaches b1 and b2, and b3 reaches a1: drawn exactly, A's
    // detail needs three of B's members, B's needs one of A's.
    const work = await workOf(
      lines("flowchart LR", "  a1 --> b1", "  a1 --> b2", "  b3 --> a1", "  a1 --> a2", "  b1 --> b3", "  b2 --> b3"),
    );
    const part = partitionOf([
      { members: ["a1", "a2"], regions: [], parent: null, tier: "T6", reason: "x" },
      { members: ["b1", "b2", "b3"], regions: [], parent: null, tier: "T6", reason: "x" },
    ]);
    const [a, b] = part.groups.map(keyOf) as [string, string];
    expect(exactSide(work, part, [a, b])).toBe(b);
    expect(exactSide(work, part, [a, b], new Set([a]))).toBe(a);
    expect(exactSide(work, part, [a, b], new Set([a, b]))).toBe(b);
  });
});

describe("a pipeline of prefix families", () => {
  test(
    "folds by lane, each extract with the bronze table it lands in, with nothing lost",
    async () => {
      const source = read("flow05-etl-fanout-fanin");
      const plan = await planOf(source, "low");
      const work = await workOf(source);
      expect(plan.loss.newReachablePairs).toBe(0);
      const lanes = work.edges.filter((e) => e.source.startsWith("ex_") && e.target.startsWith("br_"));
      expect(lanes).toHaveLength(8);
      const home = (id: string): string | undefined => plan.groups.find((g) => g.members.includes(id))?.id;
      for (const e of lanes) expect(home(e.source)).toBe(home(e.target));
      // The lanes fold whole, their detail split again into one group per lane (MJL-0038).
      const laneGroups = plan.groups.filter((g) => g.members.some((m) => m.startsWith("ex_")));
      expect(laneGroups).toHaveLength(1);
      const nested = plan.details.find((d) => d.group === laneGroups[0]?.id)?.split;
      expect(nested?.groups.map((g) => g.members.length)).toEqual([2, 2, 2, 2, 2, 2, 2]);
      // No detail names one end twice, and no overview pair is drawn twice.
      for (const d of plan.details) {
        const ends = Object.values(d.stubs);
        expect(new Set(ends).size).toBe(ends.length);
      }
      const pairs = plan.overview.edges.map((e) => `${e.source}>${e.target}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    },
    SLOW,
  );
});
