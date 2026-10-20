// What the round-17 blind rating held plans to (MJL-0039): a diagram over its
// target only for the rows it draws stays at rows dropped and folds nothing
// more, until MJL-0040 let its closed aggregates fold; every plan says why it was flagged; a group of three names every
// member, as "ADDRESS (+CITY, COUNTRY)"; and a flowchart run entered at one
// member and left from another is named by both, as "git push to main → tsc
// --noEmit (+4)". The contract and both test readers refuse each form forged.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { listedOthers, spanLabel } from "../../src/split/label.ts";
import { laddersOf, planWork } from "../../src/split/plan.ts";
import type { SplitDetail, SplitPlan } from "../../src/split/types.ts";
import { outcomeLines } from "../../src/split-report.ts";
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

// A copy of the build with one group's shown label replaced everywhere the
// plan writes it, as a forged plan would read.
const relabel = (built: Build, member: string, label: string, patch: Partial<SplitPlan["groups"][number]>): Build => {
  const broken = structuredClone(built);
  const g = broken.plan.groups.find((x) => x.members.includes(member));
  if (!g) throw new Error(`no group holds ${member}`);
  const swap = (s: string): string => s.split(`"${g.label}"`).join(`"${label}"`);
  broken.plan.overviewSource = swap(broken.plan.overviewSource);
  for (const n of broken.plan.overview.nodes) if (n.id === g.id) n.label = label;
  for (const d of broken.plan.details) {
    d.source = swap(d.source);
    for (const n of d.graph.nodes) if (n.label === g.label) n.label = label;
    for (const s of d.graph.subgraphs) if (s.label === g.label) s.label = label;
  }
  Object.assign(g, { label, ...patch });
  return broken;
};

// Whether a forged build is refused by the contract and by both test readers.
const refused = async (source: string, forged: Build, preset: string): Promise<void> => {
  expect((await checkContract(forged, configFromPreset(preset))).some((v) => v.startsWith("4:"))).toBe(true);
  expect((await faithful(source, forged.plan)).length).toBeGreaterThan(0);
  const read = await checkPlan(source, forged.plan, configFromPreset(preset), "");
  expect(read.some((f) => f.sev === "BUG" && f.kind === "glabel")).toBe(true);
};

describe("a diagram over its target only for its rows", () => {
  test(
    "folds only closed aggregates past rows dropped, and its plan says it was over on its score alone",
    async () => {
      // MJL-0039 stopped this schema at rows dropped; MJL-0040 folds its closed aggregates.
      const source = read("round11", "er06-university");
      const out = await splitOutcome(source, configFromPreset("high"));
      const plan = out.plan as SplitPlan;
      expect(plan.tier).toBe("T4");
      expect(plan.overviewNodes).toBe(21);
      expect(plan.flagged).toContain("flagged at 23 nodes and a score of 63.75");
      expect(plan.flagged).toContain("over on its score alone");
      expect(plan.flagged).toContain("so only aggregates whose other members relate to nothing else fold");
      // --split-plan prints why under the heading.
      const printed = outcomeLines("er06.mmd:1", out);
      expect(printed.slice(0, 4)).toEqual([
        "",
        "## er06.mmd:1: split plan (T4)",
        "",
        `${plan.flagged.charAt(0).toUpperCase()}${plan.flagged.slice(1)}.`,
      ]);
      expect(await serious(source, plan, "high")).toEqual([]);
    },
    SLOW,
  );

  test(
    "does so for a clinic schema with wide entities, tree-like or not",
    async () => {
      const source = read("round17", "rows-only-schema");
      const { plan } = await buildOf(source, "low");
      expect(plan.tier).toBe("T1");
      expect(plan.groups).toEqual([]);
      expect(plan.rowDetails.length).toBeGreaterThan(0);
      expect(plan.flagged).toMatch(
        /^flagged at 10 nodes and a score of [\d.]+, against a split target of 10 nodes and 20/,
      );
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );

  test(
    "is told apart from one over on both, whose plan folds",
    async () => {
      const { plan } = await buildOf(read("round9", "er01-ecommerce"), "low");
      expect(plan.flagged).toContain("over on both");
      expect(plan.flagged).not.toContain("no node folds");
      // A detail split again says why too, at its own size.
      const nested = plan.details.find((d) => d.split)?.split;
      expect(nested?.flagged).toMatch(/^flagged at \d+ nodes/);
    },
    SLOW,
  );
});

describe("a list label", () => {
  test(
    "names every member of a group of three, the others in natural order",
    async () => {
      const source = read("round11", "er04-sakila");
      const built = await buildOf(source, "medium");
      const { plan } = built;
      expect(plan.groups.map((g) => g.label)).toContain("ADDRESS (+CITY, COUNTRY)");
      // A stub for any member of the group shows its own label alone.
      const shown = plan.details.flatMap(stubLabels);
      expect(shown.some((t) => t.includes(" (in ADDRESS"))).toBe(false);
      expect(await serious(source, plan, "medium")).toEqual([]);
      // The others out of natural order, or a member it does not hold, are refused.
      await refused(source, relabel(built, "CITY", "ADDRESS (+COUNTRY, CITY)", { paired: "COUNTRY, CITY" }), "medium");
      await refused(source, relabel(built, "CITY", "ADDRESS (+CITY, STORE)", { paired: "CITY, STORE" }), "medium");
    },
    SLOW,
  );

  test(
    "names a warehouse schema's aggregates of three beside its pairs",
    async () => {
      const source = read("round17", "list-aggregates");
      const { plan } = await buildOf(source, "low");
      const labels = plan.groups.map((g) => g.label);
      expect(labels.some((l) => /^\S+ \(\+\S+, \S+\)$/.test(l))).toBe(true);
      expect(labels.some((l) => /^\S+ \(\+[^,]+\)$/.test(l))).toBe(true);
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );

  test(
    "leaves a run a range names to its range",
    async () => {
      const { plan } = await buildOf(read("round9", "flow12-id-like-labels"), "medium");
      const threes = plan.groups.filter((g) => g.members.length === 3);
      expect(threes.length).toBeGreaterThan(0);
      for (const g of threes) expect(g.label).toContain(" … ");
    },
    SLOW,
  );

  test("is offered for three members at most, with no comma in another label", () => {
    expect(listedOthers("ADDRESS", ["COUNTRY", "ADDRESS", "CITY"])).toBe("CITY, COUNTRY");
    expect(listedOthers("ROOM", ["ROOM", "BUILDING"])).toBe("BUILDING");
    expect(listedOthers("a", ["a", "b", "c", "d"])).toBeNull();
    expect(listedOthers("a", ["a", "b, c", "d"])).toBeNull();
    expect(listedOthers("a", ["a", "b", "b"])).toBeNull();
    expect(listedOthers("a", ["x", "b", "c"])).toBeNull();
    expect(listedOthers("Great Expectations suite", ["Great Expectations suite", "b", "c"])).toBe("b, c");
    expect(listedOthers("Great Expectations suite", ["Great Expectations suite", "PagerDuty", "Slack"])).toBeNull();
  });
});

describe("a span label", () => {
  test(
    "names a pipeline's runs by the step each starts at and the step it hands on from",
    async () => {
      const source = read("round17", "flow03-cicd-long-chain");
      const built = await buildOf(source, "low");
      const { plan } = built;
      const labels = plan.groups.map((g) => g.label);
      expect(labels).toContain("git push to main → tsc --noEmit (+4)");
      const setup = plan.groups.find((g) => g.members.includes("push"));
      expect(setup?.spanned).toBe(true);
      // A stub for the run's exit shows its own label, as the overview names it.
      const shown = plan.details.flatMap(stubLabels);
      expect(shown.some((t) => t.startsWith("tsc --noEmit (in "))).toBe(false);
      expect(await serious(source, plan, "low")).toEqual([]);
      // An end it does not have is refused, and so is a count of every member.
      await refused(
        source,
        relabel(built, "push", "git push to main → biome check (+4)", { labelBase: "git push to main → biome check" }),
        "low",
      );
      await refused(source, relabel(built, "push", "git push to main → tsc --noEmit (+6)", { hidden: 6 }), "low");
    },
    SLOW,
  );

  test("holds no markup, arrow or ellipsis, and two different ends", () => {
    expect(spanLabel("git push to main", "tsc --noEmit")).toBe("git push to main → tsc --noEmit");
    expect(spanLabel("a", "a")).toBeNull();
    expect(spanLabel("a → b", "c")).toBeNull();
    expect(spanLabel("a", "c …")).toBeNull();
    expect(spanLabel("<b>a</b>", "c")).toBeNull();
    expect(spanLabel("a".repeat(41), "b".repeat(41))).toBeNull();
  });
});
