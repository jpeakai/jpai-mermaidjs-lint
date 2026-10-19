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
import { shorten } from "../../src/split/label.ts";
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

describe("a qualified label", () => {
  const ACCOUNTS = [
    "flowchart TB",
    "  subgraph aws_org[AWS Organization — acme.com]",
    "    subgraph acct_prod[prod account — 111122223333]",
    "      subgraph region_use1[us-east-1]",
    "        prod_use1_web[ec2-web] --> prod_use1_rds[(rds-prod-use1)]",
    "      end",
    "    end",
    "    subgraph acct_staging[staging account — 444455556666]",
    "      subgraph region_use1_stg[us-east-1]",
    "        stg_use1_web[ec2-web] --> stg_use1_rds[(rds-staging-use1)]",
    "      end",
    "    end",
    "  end",
  ].join("\n");

  test(
    "is offered only whole, and the contract refuses one cut",
    async () => {
      const cfg = configFromPreset("low");
      const plan = await planOf(ACCOUNTS, "low");
      expect(plan.groups.map((g) => g.label)).toEqual([
        "us-east-1 (prod account — 111122223333) (+2)",
        "us-east-1 (+2)",
      ]);
      const build = await buildOf(ACCOUNTS, cfg);
      const g = build.plan.groups.find((x) => x.label === "us-east-1 (+2)");
      if (!g) throw new Error("no plain group");
      const whole = "us-east-1 (staging account — 444455556666)";
      const cut = structuredClone(build);
      const cg = cut.plan.groups.find((x) => x.id === g.id);
      if (!cg) throw new Error("no group");
      cg.labelBase = whole;
      cg.hidden = g.members.length;
      cg.label = `${shorten(whole)} (+${cg.hidden})`;
      cut.plan.overviewSource = cut.plan.overviewSource.replace(g.label, cg.label);
      expect(await checkContract(cut, cfg)).toContain(`4: group ${g.id} label "${whole}" is not from the data`);
      expect((await faithful(ACCOUNTS, cut.plan)).some((p) => p.includes(`group ${g.id} label`))).toBe(true);
      expect((await checkPlan(ACCOUNTS, cut.plan, cfg, "")).some((f) => f.sev === "BUG" && f.kind === "glabel")).toBe(
        true,
      );
    },
    SLOW,
  );
});

describe("two groups that edges join both ways", () => {
  test(
    "are drawn whole on one side and as members on the other, with edges alike drawn once",
    async () => {
      const plan = await planOf(read("state01-order-lifecycle"), "low");
      const ids = new Set(plan.groups.map((g) => g.id));
      const groupOf = (x: string): string => plan.groups.find((g) => g.members.includes(x))?.id ?? x;
      for (const d of plan.details) {
        const ends = Object.values(d.stubs);
        for (const end of ends.filter((x) => ids.has(x))) expect(ends.some((x) => x !== end && groupOf(x) === end)).toBe(false);
        const pairs = d.graph.edges.map((e) => `${d.stubs[e.source] ?? e.source}>${d.stubs[e.target] ?? e.target}`);
        const halves = pairs.filter((p) => p.split(">").some((x) => ids.has(x)));
        expect(new Set(halves).size).toBe(halves.length);
      }
      // A detail drawing a member into a whole group stands for the edge its target draws exactly.
      const into = plan.details.flatMap((d) =>
        d.graph.edges.filter((e) => ids.has(d.stubs[e.target] ?? "")).map((e) => ({ d, e })),
      );
      expect(into.length).toBeGreaterThan(0);
    },
    SLOW,
  );

  test(
    "are held to it by the contract, the reading and the checker",
    async () => {
      const source = read("state01-order-lifecycle");
      const cfg = configFromPreset("low");
      const build = await buildOf(source, cfg);
      const ids = new Set(build.plan.groups.map((g) => g.id));
      const d = build.plan.details.find((x) => x.graph.edges.some((e) => ids.has(x.stubs[e.target] ?? "")));
      const edge = d?.graph.edges.find((e) => ids.has(d.stubs[e.target] ?? ""));
      if (!(d && edge)) throw new Error("no edge into a whole group");
      // Drawn twice.
      const twice = structuredClone(build);
      const td = twice.plan.details.find((x) => x.group === d.group);
      td?.graph.edges.push({ ...edge, id: `${edge.id}-again` });
      if (td) td.source = td.source.replace(/\n {2}classDef/, `\n  ${edge.source} --> ${edge.target}\n  classDef`);
      expect((await checkContract(twice, cfg)).some((v) => v.includes("draws one edge from a group twice"))).toBe(true);
      expect((await faithful(source, twice.plan)).some((p) => p.startsWith("half edge extra"))).toBe(true);
      expect((await checkPlan(source, twice.plan, cfg, "")).some((f) => f.sev === "BUG" && f.kind === "half")).toBe(
        true,
      );
      // Labelled with a label no original edge carries.
      const relabelled = structuredClone(build);
      const rd = relabelled.plan.details.find((x) => x.group === d.group);
      const re = rd?.graph.edges.find((e) => e.id === edge.id);
      if (!(rd && re)) throw new Error("no edge");
      re.label = "invented";
      rd.source = rd.source.replace(
        `${edge.source} --> ${edge.target}\n`,
        `${edge.source} --> ${edge.target} : invented\n`,
      );
      expect(
        (await checkContract(relabelled, cfg)).some((v) => v.includes("do not come back from their targets")),
      ).toBe(true);
      expect((await faithful(source, relabelled.plan)).some((p) => p.startsWith("half edge"))).toBe(true);
      expect(
        (await checkPlan(source, relabelled.plan, cfg, "")).some((f) => f.sev === "BUG" && f.kind === "half"),
      ).toBe(true);
      // A group drawn whole beside a stub for one of its members.
      const beside = structuredClone(build);
      const bd = beside.plan.details.find((x) => x.group === d.group);
      const whole = d.stubs[edge.target] ?? "";
      const member = build.plan.groups.find((g) => g.id === whole)?.members[0] ?? "";
      if (bd) bd.stubs.s99 = member;
      expect(await checkContract(beside, cfg)).toContain(
        `5: detail ${d.group} draws ${whole} whole beside a stub for one of its members`,
      );
    },
    SLOW,
  );

  test(
    "draw the edges one way between a group and a member once, keeping only the label they share",
    async () => {
      const plan = await planOf(read("state01-order-lifecycle"), "low");
      const d = plan.details.find((x) => x.graph.nodes.some((n) => n.id === "Allocating"));
      const into = d?.graph.edges.filter((e) => e.target === "Allocating" && d.stubs[e.source] !== undefined) ?? [];
      const from = new Map<string, number>();
      for (const e of into) from.set(d?.stubs[e.source] ?? "", (from.get(d?.stubs[e.source] ?? "") ?? 0) + 1);
      expect([...from.values()].every((n) => n === 1)).toBe(true);
      const merged = into.find((e) => e.label === undefined);
      expect(merged).toBeDefined();
    },
    SLOW,
  );
});
