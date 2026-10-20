// What the round-18 blind rating held plans to (MJL-0040): a diagram over its
// target only for the rows it draws folds its closed aggregates, each named
// by every member, and says so; and a group of leaves hanging from one
// overview node is named by every member where the list fits, as "Carrier
// quote API (+ECB rates feed, Payment provider API, SMTP relay)". The
// contract and both test readers refuse each form forged.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiagramGraph } from "../../src/parse/graph.ts";
import { configFromPreset } from "../../src/parse/metrics.ts";
import type { Build } from "../../src/split/assemble.ts";
import { checkContract } from "../../src/split/contract.ts";
import { FAN_LISTED, listedOthers } from "../../src/split/label.ts";
import { laddersOf, planWork } from "../../src/split/plan.ts";
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

// Whether every relationship crossing a group's edge in the original meets
// one member, read from the original graph alone.
const closedIn = (original: DiagramGraph, members: readonly string[]): boolean => {
  const inside = new Set(members);
  const faces = original.edges
    .filter((e) => inside.has(e.source) !== inside.has(e.target))
    .map((e) => (inside.has(e.source) ? e.source : e.target));
  return new Set(faces).size === 1;
};

describe("a diagram over its target only for its rows", () => {
  test(
    "folds a university schema's closed aggregates, naming every entity, and says so",
    async () => {
      const source = read("round11", "er06-university");
      const built = await buildOf(source, "high");
      const { plan, work } = built;
      expect(plan.tier).toBe("T4");
      expect(plan.groups.map((g) => g.label).sort()).toEqual(["ENROLMENT (+GRADE)", "ROOM (+BUILDING)"]);
      expect(plan.flagged).toEndWith(
        "meets the target at 23 nodes and 38, so only aggregates whose other members relate to nothing else fold",
      );
      // SECTION's aggregate is open: ASSESSMENT relates to SUBMISSION, so both stay in view.
      expect(plan.groups.some((g) => g.members.includes("SECTION") || g.members.includes("ASSESSMENT"))).toBe(false);
      expect(plan.overview.edges.some((e) => e.source === "ASSESSMENT" && e.target === "SUBMISSION")).toBe(true);
      // No entity's name is hidden from the overview.
      const shown = plan.overview.nodes.map((n) => n.label).join("\n");
      for (const n of work.nodes.values()) expect(shown).toContain(n.label);
      expect(plan.loss.newReachablePairs).toBe(0);
      expect(await serious(source, plan, "high")).toEqual([]);
      await refused(source, relabel(built, "ROOM", "ROOM (+GRADE)", { paired: "GRADE" }), "high");
    },
    SLOW,
  );
});

describe("a hotel schema over its target only for its rows", () => {
  test(
    "folds its closed aggregates only, each by every member",
    async () => {
      const source = read("round18", "closed-aggregates");
      const built = await buildOf(source, "medium");
      const { plan, work } = built;
      expect(plan.ladder.map((s) => s.tier)).toEqual(["T1", "T4"]);
      expect(plan.groups.map((g) => g.label).sort()).toEqual([
        "BOOKING (+INVOICE, INVOICE_LINE)",
        "GUEST (+LOYALTY_CARD)",
      ]);
      const original = { edges: [...work.edges] } as DiagramGraph;
      for (const g of plan.groups) expect(closedIn(original, g.members)).toBe(true);
      expect(plan.flagged).toContain("over on its score alone");
      expect(plan.flagged).toContain("so only aggregates whose other members relate to nothing else fold");
      expect(await serious(source, plan, "medium")).toEqual([]);
    },
    SLOW,
  );

  test(
    "folds open aggregates as before once it is over with its rows dropped",
    async () => {
      const { plan } = await buildOf(read("round18", "closed-aggregates"), "low");
      expect(plan.flagged).toContain("over on both");
      expect(plan.flagged).not.toContain("only aggregates");
      expect(plan.groups.map((g) => g.label)).toContain("HOTEL (+STAFF)");
    },
    SLOW,
  );
});

describe("a group of leaves", () => {
  test(
    "names a boutique's external APIs by every member, and a stub for any by its own label",
    async () => {
      const source = read("round9", "flow01-online-boutique");
      const built = await buildOf(source, "medium");
      const { plan } = built;
      const apis = plan.groups.find((g) => g.members.includes("carrier"));
      expect(apis?.label).toBe("Carrier quote API (+ECB rates feed, Payment provider API, SMTP relay)");
      expect(apis?.hidden).toBe(0);
      const shown = plan.details.flatMap(stubLabels);
      expect(shown.some((t) => t.includes(" (in Carrier quote API"))).toBe(false);
      expect(await serious(source, plan, "medium")).toEqual([]);
      // A member it does not hold, or the others out of natural order, are refused.
      await refused(
        source,
        relabel(built, "carrier", "Carrier quote API (+ECB rates feed, Payment provider API, Cloud Trace)", {
          paired: "ECB rates feed, Payment provider API, Cloud Trace",
        }),
        "medium",
      );
      await refused(
        source,
        relabel(built, "carrier", "Carrier quote API (+SMTP relay, ECB rates feed, Payment provider API)", {
          paired: "SMTP relay, ECB rates feed, Payment provider API",
        }),
        "medium",
      );
    },
    SLOW,
  );
});

describe("a list of more than three members", () => {
  test(
    "names only a group of leaves: an author region listed is refused",
    async () => {
      const source = read("round9", "flow01-online-boutique");
      const built = await buildOf(source, "medium");
      const platform = built.plan.groups.find((g) => g.members.includes("vault"));
      const labels = (platform?.members ?? []).map((m) => built.work.nodes.get(m)?.label ?? m);
      const others = listedOthers("cert-manager", labels, FAN_LISTED);
      expect(others).not.toBeNull();
      await refused(
        source,
        relabel(built, "vault", `cert-manager (+${others})`, {
          labelBase: "cert-manager",
          paired: others ?? "",
          hidden: 0,
        }),
        "medium",
      );
    },
    SLOW,
  );

  test(
    "lists a short set of leaves and keeps the fan label for a list too long",
    async () => {
      const source = read("round18", "fan-list");
      const { plan } = await buildOf(source, "low");
      const labels = plan.groups.map((g) => g.label);
      expect(labels).toContain("ECB feed (+Card gateway, SMTP relay, VAT API)");
      expect(labels).toContain("Data platform → … (+4)");
      expect(await serious(source, plan, "low")).toEqual([]);
    },
    SLOW,
  );

  test("lists every member within eighty characters", () => {
    const apis = ["Carrier quote API", "ECB rates feed", "Payment provider API", "SMTP relay"];
    expect(listedOthers("Carrier quote API", apis, FAN_LISTED)).toBe(
      "ECB rates feed, Payment provider API, SMTP relay",
    );
    expect(listedOthers("Carrier quote API", apis)).toBeNull();
    const long = ["Card processor API", "Carrier rates API", "Mail relay", "Risk scoring API", "VAT lookup"];
    expect(listedOthers("Card processor API", long, FAN_LISTED)).toBeNull();
    expect(listedOthers("a", ["a", "b, c", "d", "e"], FAN_LISTED)).toBeNull();
  });
});
