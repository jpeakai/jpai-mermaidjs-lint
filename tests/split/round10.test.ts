// What the round-10 blind rating held plans to (MJL-0032): a workflow whose
// states are named by an id and a status keeps the statuses sharing a stem
// together and apart from other stages, and one stage of a pipeline folds
// into one group though no edge joins its tables.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { checkContract, joined } from "../../src/split/contract.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { type LabelContext, namedStubs, stubTexts } from "../../src/split/label.ts";
import { detailView, type Group, keyOf, partitionOf } from "../../src/split/quotient.ts";
import { STATUS_MARK, statusFamilies } from "../../src/split/stem.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { buildOf, lines, workOf } from "./helpers.ts";

const SLOW = 30_000;
const read = (dir: string, name: string): string =>
  readFileSync(join(import.meta.dir, "cases", dir, `${name}.mmd`), "utf8");

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

describe("a status family", () => {
  test("is the one stem two id-led statuses share", () => {
    const labels = new Map([
      ["S1", "10008 Ready for Release"],
      ["S2", "10009 Released"],
      ["S3", "10007 QA"],
      ["S4", "10010 Closed"],
      ["S5", "PLAT-1201 Release train"],
      ["S6", "Release notes"],
    ]);
    expect(statusFamilies(labels)).toEqual(
      new Map([
        ["S1", `${STATUS_MARK}releas`],
        ["S2", `${STATUS_MARK}releas`],
      ]),
    );
  });

  test("is none for a status sharing two stems", () => {
    const labels = new Map([
      ["a", "101 Code review"],
      ["b", "102 Code review done"],
      ["c", "103 Review code"],
    ]);
    expect(statusFamilies(labels)).toEqual(new Map());
  });

  test(
    "keeps a workflow's release statuses in one group, apart from code review",
    async () => {
      const plan = await planOf(read("round9", "state08-jira-workflow-ids"), "low-density");
      const holding = (id: string) => plan.groups.find((g) => g.members.includes(id));
      expect(holding("S10008")).toBeDefined();
      expect(holding("S10008")).toBe(holding("S10009"));
      expect(holding("S10006")?.members.includes("S10009") ?? false).toBe(false);
    },
    SLOW,
  );
});

describe("a whole-group stub beside its namesake member", () => {
  test("never names the namesake as the member its edges leave", async () => {
    const work = await workOf(
      lines(
        "flowchart LR",
        '  a["A"] --> d["D"]',
        "  d --> a",
        '  a --> b["B"]',
        '  b --> c["C"]',
        '  d --> e["E"]',
        '  e --> f["F"]',
      ),
    );
    const one: Group = {
      members: ["a", "b", "c"],
      regions: [],
      parent: null,
      tier: "T6",
      reason: "suggested grouping",
    };
    const two: Group = {
      members: ["d", "e", "f"],
      regions: [],
      parent: null,
      tier: "T6",
      reason: "suggested grouping",
    };
    const part = partitionOf([one, two]);
    const ctx: LabelContext = {
      work,
      part,
      groups: new Map([
        [keyOf(one), { id: "g1", base: "A", label: "A (+2)" }],
        [keyOf(two), { id: "g2", base: "D", label: "D (+2)" }],
      ]),
    };
    // Edges join the two groups both ways, so a detail draws the other group
    // whole or as stubs for its members, never both (MJL-0033).
    const view = detailView(work, part, two);
    const ends = view.stubs.map((s) => s.endpoint);
    expect(ends.includes(keyOf(one)) && ends.some((e) => one.members.includes(e))).toBe(false);
    // Drawn beside its namesake member, the whole stub would still not name it.
    const stubs = [
      { id: "s1", endpoint: keyOf(one) },
      { id: "s2", endpoint: "a" },
    ];
    const texts = stubTexts(ctx, stubs);
    const named = namedStubs(ctx, stubs, texts, () => ["a"]);
    expect([...(named ?? texts).values()].map((t) => t.label).sort()).toEqual(["A (+2)", "A (in A (+2))"]);
  });
});

describe("one stage of a pipeline", () => {
  test(
    "folds into one group though no edge joins its tables, and declares no loss",
    async () => {
      const plan = await planOf(read("round9", "flow05-etl-fanout-fanin"), "low-density");
      const gold = plan.groups.find((g) => g.members.includes("g_rev"));
      expect(gold?.members).toEqual(["g_csat", "g_funnel", "g_ltv", "g_rev", "g_stock"]);
      expect(plan.loss.newReachablePairs).toBe(0);
    },
    SLOW,
  );

  test("is connected through the neighbour its members share, and only when they name one family", async () => {
    const work = await workOf(
      lines(
        "flowchart LR",
        "  dq --> sv_a --> out",
        "  dq --> sv_b --> out",
        "  dq --> other --> out",
        "  dq --> l1",
        "  dq --> l2",
      ),
    );
    expect(joined(work, { members: ["sv_a", "sv_b"], regions: [] })).toBe(true);
    expect(joined(work, { members: ["sv_a", "other"], regions: [] })).toBe(false);
    expect(joined(work, { members: ["l1", "l2"], regions: [] })).toBe(true);
    expect(joined(work, { members: ["sv_a", "l1"], regions: [] })).toBe(false);
    expect(joined(work, { members: ["dq", "sv_a", "other"], regions: [] })).toBe(true);
  });

  test(
    "a suggested group joined by nothing is caught by the contract",
    async () => {
      const source = read("round9", "flow05-etl-fanout-fanin");
      const cfg = configFromPreset("low-density");
      const build = await buildOf(source, cfg);
      const gold = build.plan.groups.find((g) => g.members.includes("g_rev"));
      if (!gold) throw new Error("no gold group");
      expect(gold.tier).toBe("T6");
      gold.members = [...gold.members, "looker"].sort();
      expect(
        (await checkContract(build, cfg)).some((v) => v.includes(`suggested group ${gold.id} is not connected`)),
      ).toBe(true);
    },
    SLOW,
  );
});
