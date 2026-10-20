// What the round-20 change holds plans to (MJL-0042): twin chains in a
// detail split again, too many to fold whole, fold in runs of lanes, by the
// stage words their labels lead with where every such set fits, else in
// label order cut evenly. Other nested details keep their groups, and the
// contract and both test readers refuse a forged run label.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { stageWord } from "../../src/split/label.ts";
import { laddersOf, planWork } from "../../src/split/plan.ts";
import { meets } from "../../src/split/quotient.ts";
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

const detailOf = (plan: SplitPlan, member: string): SplitDetail => {
  const g = plan.groups.find((x) => x.members.includes(member));
  const d = plan.details.find((x) => x.group === g?.id);
  if (!d) throw new Error(`no detail holds ${member}`);
  return d;
};

const nestedOf = (plan: SplitPlan, member: string): SplitPlan => {
  const split = detailOf(plan, member).split;
  if (!split) throw new Error(`the detail holding ${member} is not split again`);
  return split;
};

// Every detail of a nested plan meets the target, so none is split a third time.
const allFit = (plan: SplitPlan, preset: string): boolean =>
  plan.details.every((d) => d.split === null && meets(d.nodes, d.score, configFromPreset(preset)));

// A copy of the build with the label of the run holding a member, in the
// detail split again, replaced everywhere that nested plan writes it.
const forgeRun = (built: Build, member: string, forged: string): Build => {
  const broken = structuredClone(built);
  const outer = broken.plan.groups.find((g) => g.members.includes(member));
  const nested = outer ? broken.nested[outer.id] : undefined;
  const run = nested?.plan.groups.find((g) => g.members.includes(member));
  const detail = broken.plan.details.find((x) => x.group === outer?.id);
  if (!(nested && run && detail)) throw new Error(`no run holds ${member}`);
  const swap = (s: string): string => s.split(`"${run.label}"`).join(`"${forged}"`);
  nested.plan.overviewSource = swap(nested.plan.overviewSource);
  for (const n of nested.plan.overview.nodes.filter((x) => x.id === run.id)) n.label = forged;
  for (const d of nested.plan.details) d.source = swap(d.source);
  run.label = forged;
  detail.split = nested.plan;
  return broken;
};

const FLOW05 = read("round12", "flow05-etl-fanout-fanin");

describe("twin chains in a detail split again", () => {
  test(
    "fold in label order, cut evenly, when no stage word gives sets that fit",
    async () => {
      const { plan } = await buildOf(FLOW05, "low");
      const nested = nestedOf(plan, "ex_pg");
      expect(nested.groups.map((g) => g.label)).toEqual(["Extract → bronze (+8)", "Extract/Ingest → bronze (+6)"]);
      expect(nested.groups.every((g) => g.reason === "twins")).toBe(true);
      // Each lane stays whole in one run.
      const home = (id: string): string | undefined => nested.groups.find((g) => g.members.includes(id))?.id;
      for (const [ex, br] of [
        ["ex_pg", "br_orders"],
        ["ex_s3", "br_partner"],
      ] as const)
        expect(home(ex)).toBe(home(br));
      expect(nested.overviewNodes).toBe(4);
      expect(allFit(nested, "low")).toBe(true);
      expect(nested.loss.newReachablePairs).toBe(0);
      expect(await serious(FLOW05, plan, "low")).toEqual([]);
    },
    SLOW,
  );

  test(
    "fold by the stage word their labels lead with, a lane alone left alone",
    async () => {
      const { plan } = await buildOf(FLOW05, "medium");
      const nested = nestedOf(plan, "ex_pg");
      expect(nested.groups.map((g) => g.label)).toEqual(["Extract → bronze (+12)", "Ingest partner SFTP drops (+1)"]);
      expect(allFit(nested, "medium")).toBe(true);
      expect(await serious(FLOW05, plan, "medium")).toEqual([]);
    },
    SLOW,
  );

  test(
    "fold one run per verb in a pipeline led by three",
    async () => {
      const source = read("round20", "lanes-three-verbs");
      const { plan } = await buildOf(source, "low");
      expect(plan.groups.find((g) => g.members.includes("a1"))?.label).toBe("… → staging (+18)");
      const nested = nestedOf(plan, "a1");
      expect(nested.groups.map((g) => g.label)).toEqual([
        "Sync → staging (+6)",
        "Pull → staging (+6)",
        "Copy → staging (+6)",
      ]);
      expect(allFit(nested, "low")).toBe(true);
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );
});

describe("a run of lanes", () => {
  test(
    "is refused with its label forged",
    async () => {
      const broken = forgeRun(await buildOf(FLOW05, "low"), "ex_pg", "Extract → bronze (+6)");
      expect((await checkContract(broken, configFromPreset("low"))).some((v) => v.includes("4:"))).toBe(true);
      expect((await serious(FLOW05, broken.plan, "low")).length).toBeGreaterThan(0);
    },
    SLOW,
  );
});

describe("a nested detail with no twin chains", () => {
  test.each(["round12", "round13"])(
    "keeps the compiler AST's groups in the %s set",
    async (set) => {
      const source = read(set, "class04-compiler-ast");
      const { plan } = await buildOf(source, "low");
      const nested = nestedOf(plan, "SourceFile");
      expect(nested.groups.map((g) => g.label)).toEqual([
        "Expression (+3)",
        "ClassDeclaration (+FunctionDeclaration)",
        "Statement (+3)",
      ]);
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );
});

describe("a stage word", () => {
  test("is a label's dotted namespace, else its first word, else null", () => {
    expect(stageWord("bronze.orders")).toBe("bronze");
    expect(stageWord("Extract Postgres orders")).toBe("Extract");
    expect(stageWord("W0")).toBeNull();
  });
});
