// Round 7 (MJL-0029): runs of alike nodes named by an honest range, id-led
// groups named by their first label, dense meshes folded by tight cliques,
// and shared terminals kept in view.

import { describe, expect, test } from "bun:test";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { MAX_CLIQUES, maximalCliques } from "../../src/split/clique.ts";
import { checkContract } from "../../src/split/contract.ts";
import { isStar, STAR, splitOutcome } from "../../src/split/index.ts";
import { ID_LEAD, rangeLabel } from "../../src/split/label.ts";
import { LOOSE, STRICT, terminalsOf } from "../../src/split/rules.ts";
import { keptHub } from "../../src/split/tier.ts";
import { proposeT6 } from "../../src/split/tier6.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { buildOf, ctxOf, lines, target, workOf } from "./helpers.ts";

const SLOW = 30_000;

const SERVICES = [
  "accounts",
  "audit",
  "auth",
  "billing",
  "cards",
  "config",
  "disputes",
  "export",
  "flags",
  "fraud",
  "geo",
  "kyc",
  "ledger",
  "limits",
  "loans",
  "payments",
  "reports",
  "search",
  "users",
  "webhooks",
];
// A gateway fronting twenty services, written in no particular order.
const GATEWAY = lines(
  "flowchart LR",
  '  web["Web app"] --> gw["API gateway"]',
  ...[...SERVICES].reverse().map((s, i) => `  gw --> s${i}["${s}-service"]`),
);

describe("a range label", () => {
  test("is the first and last label in natural order, counting the rest", () => {
    expect(rangeLabel(["S10", "S2", "S9"])).toBe("S2 … S10");
    expect(rangeLabel(["a", "b"])).toBeNull();
    expect(rangeLabel(["a", "a", "a"])).toBeNull();
    expect(rangeLabel(["**a**", "b", "c"])).toBeNull();
    expect(rangeLabel(["a very long first label here", "b", "z very long last label here"])).toBeNull();
  });

  test("is refused when another group's member falls inside it", () => {
    expect(rangeLabel(["a", "b", "d"], ["c"])).toBeNull();
    expect(rangeLabel(["a", "b", "d"], ["e"])).toBe("a … d");
    expect(rangeLabel(["a", "b", "d"], ["d"])).toBeNull();
  });

  test("an id lead is letters, a dash and two digits or more", () => {
    for (const l of ["S10004", "DATA-0381", "10011 Wont Do", "OPS_12"]) expect(ID_LEAD.test(l)).toBe(true);
    for (const l of ["v2 api", "Orders", "A1", "2x"]) expect(ID_LEAD.test(l)).toBe(false);
  });
});

describe("a star", () => {
  test(
    "is never offered when every group is a range of one star's leaves (MJL-0033)",
    async () => {
      const cfg = configFromPreset("medium-density");
      const { plan } = await buildOf(GATEWAY, cfg);
      expect(isStar(plan, 21)).toBe(true);
      expect(await splitOutcome(GATEWAY, cfg)).toEqual({ plan: null, reason: STAR, violations: [] });
      // Groups that sit apart in the overview, or hold half the diagram or less, are no star.
      const apart = structuredClone(plan);
      const [g] = apart.groups;
      if (!g) throw new Error("no group");
      g.shape = "cylinder";
      expect(isStar(apart, 21)).toBe(false);
      expect(isStar(plan, 2 * plan.groups.reduce((n, x) => n + x.members.length, 0))).toBe(false);
    },
    SLOW,
  );
});

describe("a range label in a plan", () => {
  test(
    "names sibling-leaf runs cut in label order, and reads back",
    async () => {
      const cfg = configFromPreset("medium-density");
      const { plan } = await buildOf(GATEWAY, cfg);
      const ranges = plan.groups.map((g) => g.labelBase);
      expect(ranges.every((b) => b.includes(" … "))).toBe(true);
      const first = plan.groups.find((g) => g.labelBase.startsWith("accounts-service … "));
      expect(first).toBeDefined();
      expect(first?.hidden).toBe((first?.members.length ?? 0) - 2);
      expect(await faithful(GATEWAY, plan)).toEqual([]);
      const found = (await checkPlan(GATEWAY, plan, cfg, "")).filter((f) => f.sev === "BUG" || f.sev === "AMBIG");
      expect(found).toEqual([]);
    },
    SLOW,
  );

  test(
    "is held exact by the contract, the reading and the checker",
    async () => {
      const cfg = configFromPreset("medium-density");
      const build = await buildOf(GATEWAY, cfg);
      const g = build.plan.groups[0];
      const other = build.plan.groups[1]?.members[0];
      if (!(g && other)) throw new Error("no two groups");
      const broken = structuredClone(build);
      const bg = broken.plan.groups[0];
      if (!bg) throw new Error("no group");
      const wrong = `${g.labelBase.split(" … ")[0]} … zzz-service`;
      bg.labelBase = wrong;
      bg.label = `${wrong} (+${g.hidden})`;
      broken.plan.overviewSource = broken.plan.overviewSource.replace(g.label, bg.label);
      expect(await checkContract(broken, cfg)).toContain(`4: group ${g.id} label "${wrong}" is not from the data`);
      expect((await faithful(GATEWAY, broken.plan)).length).toBeGreaterThan(0);
      const found = await checkPlan(GATEWAY, broken.plan, cfg, "");
      expect(found.some((f) => f.sev === "BUG" && f.kind === "glabel")).toBe(true);
      const counted = structuredClone(build);
      const cg = counted.plan.groups[0];
      if (!cg) throw new Error("no group");
      cg.hidden += 1;
      cg.label = `${g.labelBase} (+${cg.hidden})`;
      counted.plan.overviewSource = counted.plan.overviewSource.replace(g.label, cg.label);
      expect(await checkContract(counted, cfg)).toContain(`4: group ${g.id} counts ${cg.hidden} hidden members`);
      expect((await checkPlan(GATEWAY, counted.plan, cfg, "")).some((f) => f.kind === "glabel")).toBe(true);
    },
    SLOW,
  );
});

// A workflow export whose states are named by status id.
const WORKFLOW = lines(
  "stateDiagram-v2",
  "  [*] --> S10000",
  ...[
    "Open",
    "Triage",
    "Backlog",
    "Selected",
    "In Progress",
    "Blocked",
    "Code Review",
    "QA",
    "Ready for Release",
    "Released",
    "Closed",
    "Wont Do",
    "Duplicate",
    "Reopened",
    "Needs Info",
    "UAT",
    "Hotfix",
  ].map((name, i) => `  S${10000 + i} : ${10000 + i} ${name}`),
  ...[
    [0, 1],
    [1, 2],
    [1, 11],
    [1, 12],
    [1, 14],
    [14, 1],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 4],
    [4, 6],
    [6, 4],
    [6, 7],
    [7, 4],
    [7, 15],
    [15, 4],
    [15, 8],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 13],
    [13, 4],
    [9, 16],
    [16, 6],
    [11, 10],
    [12, 10],
    [2, 11],
    [3, 2],
  ].map(([a = 0, b = 0], i) => `  S${10000 + a} --> S${10000 + b} : T${i}`),
  "  S10010 --> [*]",
);

describe("an id-led group with no honest range", () => {
  test(
    "is named by its first label in natural order",
    async () => {
      const plan = (await splitOutcome(WORKFLOW, configFromPreset("low-density"))).plan as SplitPlan;
      expect(await faithful(WORKFLOW, plan)).toEqual([]);
      const backlog = plan.groups.find((g) => g.members.includes("S10002"));
      expect(backlog?.members).toContain("S10011");
      expect(backlog?.labelBase).toBe("10002 Backlog");
      expect(plan.groups.some((g) => g.labelBase.includes(" … "))).toBe(false);
    },
    SLOW,
  );
});

describe("maximal cliques", () => {
  const edges = new Set(["a|b", "a|c", "b|c", "c|d", "d|e", "c|e", "a|d"]);
  const adjacent = (x: string, y: string): boolean => edges.has(`${x}|${y}`) || edges.has(`${y}|${x}`);

  test("are each reported once, in natural order, whatever the input order", () => {
    const want = [
      ["a", "b", "c"],
      ["a", "c", "d"],
      ["c", "d", "e"],
    ];
    const sort = (cs: string[][]): string[][] =>
      cs
        .map((c) => c.join())
        .sort()
        .map((c) => c.split(","));
    expect(sort(maximalCliques(["a", "b", "c", "d", "e"], adjacent))).toEqual(want);
    expect(maximalCliques(["e", "d", "c", "b", "a"], adjacent)).toEqual(
      maximalCliques(["a", "b", "c", "d", "e"], adjacent),
    );
  });

  test("are capped", () => {
    // A complete multipartite graph of parts of two has 2^k maximal cliques.
    const vs = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const apart = (x: string, y: string): boolean =>
      Math.floor(Number(x.slice(1)) / 2) !== Math.floor(Number(y.slice(1)) / 2);
    expect(maximalCliques(vs, apart)).toHaveLength(MAX_CLIQUES);
  });
});

// Eight services where every pair talks.
const MESH = lines(
  "flowchart LR",
  ...["a", "b", "c", "d", "e", "f", "g", "h"].flatMap((x, i, all) => all.slice(i + 1).map((y) => `  ${x} --- ${y}`)),
);

describe("a dense mesh", () => {
  // Every node of a complete graph is a hub, so the strict rules fold none.
  test("proposes tight cliques that outrank every pair", async () => {
    const work = await workOf(MESH);
    const cands = proposeT6(ctxOf(work, target(20, 200), undefined, LOOSE));
    const cliques = cands.filter((c) => c.reason === "tight clique");
    expect(cliques.length).toBeGreaterThan(0);
    const best = [...cands].sort((x, y) => (y.priority ?? 0) - (x.priority ?? 0))[0];
    expect(best?.reason).toBe("tight clique");
  });

  test("a sparse graph proposes none", async () => {
    const work = await workOf(lines("flowchart LR", "  a --> b --> c --> d --> e --> f", "  a --> c"));
    expect(proposeT6(ctxOf(work, target(20, 200))).some((c) => c.reason === "tight clique")).toBe(false);
  });
});

describe("a shared terminal", () => {
  const FAILURES = lines(
    "flowchart LR",
    "  a --> b --> c --> d --> e --> f --> g --> h",
    "  b -->|fail| x1[Abort] --> alert[Notify on-call]",
    "  d -->|fail| x2[Rollback] --> alert",
    "  f -->|fail| x3[Block] --> alert",
  );

  test("is three nodes or more leading in and nothing out, in a flow", async () => {
    const work = await workOf(FAILURES);
    expect([...terminalsOf(work)]).toEqual(["alert"]);
    expect(keptHub(ctxOf(work, target(20, 200), undefined, STRICT), "alert")).toBe(true);
    const mesh = await workOf(lines("flowchart LR", "  a --- t", "  b --- t", "  c --- t"));
    expect(terminalsOf(mesh).size).toBe(0);
    const er = await workOf(lines("erDiagram", "  A ||--o{ T : x", "  B ||--o{ T : y", "  C ||--o{ T : z"));
    expect(terminalsOf(er).size).toBe(0);
  });

  test(
    "stays out of every group under the strict rules",
    async () => {
      const plan = (await splitOutcome(FAILURES, target(8, 14))).plan as SplitPlan;
      expect(plan.groups.some((g) => g.members.includes("alert"))).toBe(false);
      expect(await faithful(FAILURES, plan)).toEqual([]);
    },
    SLOW,
  );
});
