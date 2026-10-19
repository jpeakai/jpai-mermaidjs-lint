// What the round-9 blind rating held plans to: an overview lands near its
// target rather than far below it, no one group swallows most of a diagram,
// a suggested group keeps to one id family, a plan leaves few relationships
// between two groups, and a detail never draws two stubs with one text.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { checkContract } from "../../src/split/contract.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { evenFloorOf } from "../../src/split/plan.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { buildOf, workOf } from "./helpers.ts";

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

describe("a detail never draws two stubs with one text", () => {
  const flow01 = async () => {
    const source = read("flow01-online-boutique");
    const cfg = configFromPreset("medium-density");
    const out = await splitOutcome(source, cfg);
    if (!out.plan) throw new Error(out.reason);
    return { source, cfg, plan: out.plan };
  };
  const observability = (plan: SplitPlan) => {
    const g = plan.groups.find((x) => x.labelBase === "Observability");
    const d = plan.details.find((x) => x.group === g?.id);
    if (!d) throw new Error("no Observability detail");
    return d;
  };

  test(
    "draws one stub for one whole group, and its edges drawing alike once (MJL-0032)",
    async () => {
      const { source, plan } = await flow01();
      expect(await faithful(source, plan)).toEqual([]);
      for (const d of plan.details) {
        const labels = d.graph.nodes.filter((n) => d.stubs[n.id] !== undefined).map((n) => n.label);
        expect(new Set(labels).size).toBe(labels.length);
        const drawn = d.graph.edges.map((e) => JSON.stringify([e.source, e.target, e.label ?? "", e.kind ?? ""]));
        expect(new Set(drawn).size).toBe(drawn.length);
      }
      const d = observability(plan);
      const checkout = d.graph.nodes.filter((n) => n.label === "Checkout domain (+5)");
      expect(checkout).toHaveLength(1);
      expect(d.graph.edges.filter((e) => e.source === checkout[0]?.id)).toHaveLength(1);
    },
    SLOW,
  );

  test(
    "an edge from a whole group drawn twice is caught by the contract, the reading and the checker",
    async () => {
      const { source, cfg } = await flow01();
      const build = await buildOf(source, cfg);
      const d = observability(build.plan);
      const stub = d.graph.nodes.find((n) => n.label === "Checkout domain (+5)");
      const edge = d.graph.edges.find((e) => e.source === stub?.id);
      if (!edge) throw new Error("no edge from the Checkout domain stub");
      d.graph.edges.push({ ...edge, id: `${edge.id}-again` });
      const line = d.source.split("\n").find((l) => l.trim().startsWith(`${edge.source} `)) ?? "";
      d.source = d.source.replace(`${line}\n`, `${line}\n${line}\n`);
      expect((await checkContract(build, cfg)).some((v) => v.includes("draws one edge from a group twice"))).toBe(true);
      expect((await faithful(source, build.plan)).some((p) => p.startsWith("half edge extra"))).toBe(true);
      const found = await checkPlan(source, build.plan, cfg, "");
      expect(found.some((f) => f.sev === "BUG" && f.msg.includes("whole-group stub edge drawn twice"))).toBe(true);
    },
    SLOW,
  );
});

describe("a whole-group stub beside a stub for the member it is named after", () => {
  test(
    "names the member its edges leave, so the two never read alike",
    async () => {
      const source = read("state08-jira-workflow-ids");
      const plan = await planOf(source, "low-density");
      for (const d of plan.details) {
        const stubs = d.graph.nodes.filter((n) => d.stubs[n.id] !== undefined);
        for (const g of plan.groups.filter((x) => stubs.some((n) => n.label === `${x.labelBase} (in group)`))) {
          const whole = stubs.filter((n) => d.stubs[n.id] === g.id);
          expect(whole.filter((n) => !n.label.startsWith(`${g.label} from `)).map((n) => n.label)).toEqual([]);
        }
      }
    },
    SLOW,
  );

  test(
    "a stub naming a member that draws none of its edges is caught by the contract, the reading and the checker",
    async () => {
      const source = read("er01-ecommerce");
      const cfg = configFromPreset("low-density");
      const build = await buildOf(source, cfg);
      // A whole-group stub drawing an edge out, named after a member whose
      // edges it does not draw.
      const groupIds = new Set(build.plan.groups.map((g) => g.id));
      const d = build.plan.details.find((x) =>
        x.graph.edges.some((e) => groupIds.has(x.stubs[e.source] ?? "") && x.stubs[e.target] === undefined),
      );
      const edge = d?.graph.edges.find((e) => groupIds.has(d.stubs[e.source] ?? ""));
      const stub = d?.graph.nodes.find((n) => n.id === edge?.source);
      if (!(d && edge && stub)) throw new Error("no whole-group stub drawing an edge out");
      const g = build.plan.groups.find((x) => x.id === d.stubs[stub.id]);
      const draws = (m: string): boolean =>
        build.work.edges.some((e) => e.source === m && e.target === edge.target && e.label === edge.label);
      const other = g?.members.filter((m) => !draws(m)).map((m) => build.work.nodes.get(m)?.label ?? m)[0];
      if (!(g && other)) throw new Error("no other member to name");
      const wrong = `${g.label} from ${other}`;
      d.source = d.source.replace(stub.label, wrong);
      stub.label = wrong;
      expect((await checkContract(build, cfg)).some((v) => v.includes("names a member that does not draw"))).toBe(true);
      expect((await faithful(source, build.plan)).some((p) => p.includes("draws an edge its member has not"))).toBe(
        true,
      );
      const found = await checkPlan(source, build.plan, cfg, "");
      expect(found.some((f) => f.sev === "BUG" && f.msg.includes("draws an edge its member has not"))).toBe(true);
    },
    SLOW,
  );
});
