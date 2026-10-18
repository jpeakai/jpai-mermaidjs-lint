// The blind review (MJL-0030): a group is named where a reader enters it, an
// aggregate after the entity its edges leave from, a dense mesh is refused,
// a state every failure ends at stays in view, a detail never draws one edge
// twice, and parallel edges between two nodes sit side by side.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECISIONS } from "../../scripts/split-steps.ts";
import { configFromPreset, type ThresholdConfig } from "../../src/parse/metrics.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { EMPTY_PARTITION, labelChoices, rankedMembers } from "../../src/split/quotient.ts";
import { type FoldRules, RELAXED, terminalsOf } from "../../src/split/rules.ts";
import { mixesFamilies, stageOf } from "../../src/split/stem.ts";
import { proposeT6 } from "../../src/split/tier6.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { ctxOf, lines, ORDERS, workOf } from "./helpers.ts";

const SLOW = 30_000;

const planOf = async (source: string, config: ThresholdConfig): Promise<SplitPlan> => {
  const out = await splitOutcome(source, config);
  expect(out.violations).toEqual([]);
  if (!out.plan) throw new Error(out.reason);
  expect(await faithful(source, out.plan)).toEqual([]);
  const serious = (await checkPlan(source, out.plan, config, "")).filter((f) => f.sev === "BUG" || f.sev === "AMBIG");
  expect(serious).toEqual([]);
  return out.plan;
};

// The Sakila rental schema's relationships: LANGUAGE is a lookup FILM hangs
// from, so FILM's aggregate is rooted at LANGUAGE.
const SAKILA = lines(
  "erDiagram",
  '  ACTOR ||--o{ FILM_ACTOR : "appears in"',
  "  FILM ||--o{ FILM_ACTOR : casts",
  '  FILM ||--o{ FILM_CATEGORY : "classified as"',
  "  CATEGORY ||--o{ FILM_CATEGORY : groups",
  '  LANGUAGE ||--o{ FILM : "spoken in"',
  '  LANGUAGE |o..o{ FILM : "original language"',
  '  FILM ||--|| FILM_TEXT : "indexed by"',
  '  FILM ||--o{ INVENTORY : "stocked as"',
  "  STORE ||--o{ INVENTORY : holds",
  '  INVENTORY ||--o{ RENTAL : "rented as"',
  "  CUSTOMER ||--o{ RENTAL : rents",
  "  STAFF ||--o{ RENTAL : processes",
  "  CUSTOMER ||--o{ PAYMENT : pays",
  "  STAFF ||--o{ PAYMENT : takes",
  '  RENTAL |o..o{ PAYMENT : "settled by"',
  "  STORE ||--o{ CUSTOMER : registers",
  "  STORE ||--o{ STAFF : employs",
  '  STORE }o..|| STAFF : "managed by"',
  '  ADDRESS ||--o{ CUSTOMER : "lives at"',
  '  ADDRESS ||--o{ STAFF : "lives at"',
  '  ADDRESS ||--o{ STORE : "located at"',
  "  CITY ||--o{ ADDRESS : contains",
  "  COUNTRY ||--o{ CITY : contains",
);

// A billing model whose root ACCOUNT owns CUSTOMER, which holds the rest.
const BILLING = lines(
  "erDiagram",
  "  ACCOUNT ||--o{ CUSTOMER : owns",
  "  CUSTOMER ||--o{ SUBSCRIPTION : holds",
  "  SUBSCRIPTION ||--|{ SUBSCRIPTION_ITEM : contains",
  '  SUBSCRIPTION_ITEM }o..|| PRICE : "billed at"',
  "  SUBSCRIPTION }o..o| COUPON : discounts",
  "  CUSTOMER ||--o{ INVOICE : billed",
  "  SUBSCRIPTION ||--o{ INVOICE : generates",
  "  ACCOUNT ||--o{ WEBHOOK : configures",
);

describe("naming an aggregate", () => {
  test("after the member its edges leave from, when the root is a lookup hanging from one member", async () => {
    const work = await workOf(SAKILA);
    const g = {
      members: ["FILM", "LANGUAGE"],
      regions: [],
      parent: null,
      tier: "T4" as const,
      reason: "aggregate root",
      head: "LANGUAGE",
    };
    expect(labelChoices(work, g)[0]?.base).toBe("FILM");
  });

  test("after its root when the root owns more than one member", async () => {
    const work = await workOf(BILLING);
    const members = ["ACCOUNT", "CUSTOMER", "SUBSCRIPTION", "SUBSCRIPTION_ITEM", "WEBHOOK"];
    const g = { members, regions: [], parent: null, tier: "T4" as const, reason: "aggregate root", head: "ACCOUNT" };
    expect(labelChoices(work, g)[0]?.base).toBe("ACCOUNT");
  });

  test(
    "reads FILM in the Sakila overview, not LANGUAGE",
    async () => {
      const plan = await planOf(SAKILA, configFromPreset("medium-density"));
      const film = plan.groups.find((g) => g.members.includes("FILM"));
      expect(film?.labelBase).toBe("FILM");
    },
    SLOW,
  );
});

// A release pipeline: one long chain with failure exits.
const PIPELINE = lines(
  "flowchart LR",
  '  push["git push to main"] --> checkout["actions/checkout"] --> cache["Restore bun cache"] --> install["bun install"]',
  '  install --> lint["biome check"] --> typecheck["tsc --noEmit"] --> unit["bun test unit"]',
);

// Twin extract-then-load chains between one start and one quality suite.
const TWIN_CHAINS = lines(
  "flowchart LR",
  '  start["Start extract"]',
  ...["Postgres orders", "MySQL inventory", "Stripe charges", "GA4 events"].flatMap((name, i) => [
    `  start --> ex${i}["Extract ${name}"]`,
    `  ex${i} --> br${i}["bronze.${name.split(" ")[1]}"]`,
    `  br${i} --> dq["Quality suite"]`,
  ]),
);

describe("naming a chain-like group", () => {
  test("after its entry in flow order, not its exit", async () => {
    const work = await workOf(PIPELINE);
    const members = ["cache", "checkout", "install", "lint", "push", "typecheck"];
    expect(rankedMembers(work, { members, tier: "T5" })[0]).toBe("push");
    expect(rankedMembers(work, { members, tier: "T6" })[0]).toBe("push");
  });

  test("of twin chains, after the first entry by label, never a later stage", async () => {
    const work = await workOf(TWIN_CHAINS);
    const members = ["br0", "br1", "br2", "br3", "ex0", "ex1", "ex2", "ex3"];
    const g = { members, regions: [], parent: null, tier: "T2" as const, reason: "twins" };
    expect(labelChoices(work, g, { range: null, byLabel: false })[0]?.base).toBe("Extract GA4 events");
  });

  test("a group that is no chain keeps the main-path rule", async () => {
    const work = await workOf(lines("flowchart LR", "  s --> q", "  q --> p", "  q --> r", "  p --> t", "  r --> t"));
    expect(rankedMembers(work, { members: ["p", "q", "r"], tier: "T6" })[0]).toBe("q");
  });
});

describe("a prefix family boundary", () => {
  // Two pairs with equal gain: bronze.a with bronze.b, and bronze.c with gold.d.
  const STAGES = lines("flowchart LR", '  a["bronze.a"] --> b["bronze.b"]', '  c["bronze.c"] --> d["gold.d"]');

  test("is never crossed under the strict rules", async () => {
    const work = await workOf(STAGES);
    const cands = proposeT6(ctxOf(work, configFromPreset("low-density")));
    expect(cands.map((c) => c.keys)).toEqual([["a", "b"]]);
    expect(cands[0]?.kin).toBe(1);
  });

  test("with families mixed, ranks the pair that crosses it after any pair within one", async () => {
    const work = await workOf(STAGES);
    const rules = RELAXED[1] as FoldRules;
    expect(rules.keepFamilies).toBe(false);
    const cands = proposeT6(ctxOf(work, configFromPreset("low-density"), EMPTY_PARTITION, rules));
    const of = (x: string) => cands.find((c) => c.keys.includes(x));
    expect(of("a")?.priority).toBeCloseTo(of("c")?.priority ?? Number.NaN);
    expect(of("a")?.kin).toBe(1);
    expect(of("c")?.kin).toBe(0);
    expect(of("a")?.tie ?? Number.NaN).toBeGreaterThan(of("c")?.tie ?? Number.NaN);
  });

  test("is read from a dotted label, an id-led label or an id with an underscore", () => {
    expect(stageOf("bronze.orders", "x")).toBe("bronze");
    expect(stageOf("PLAT-1201", "PLAT-1201")).toBe("plat");
    expect(stageOf("OPS_12 restart", "o")).toBe("ops");
    expect(stageOf("Extract", "ex_pg")).toBe("ex");
    expect(stageOf("10002 Backlog", "S10002")).toBeNull();
    expect(stageOf("Orders", "orders")).toBeNull();
  });
});

describe("an id family", () => {
  test("keeps every suggested group to one family when the target can be met so", async () => {
    const source = readFileSync(join(import.meta.dir, "cases", "round9", "flow12-id-like-labels.mmd"), "utf8");
    const out = await splitOutcome(source, configFromPreset("medium-density"));
    if (!out.plan) throw new Error(out.reason);
    const work = await workOf(source);
    const mixed = out.plan.groups.filter((g) =>
      mixesFamilies(g.members.map((m) => stageOf(work.nodes.get(m)?.label ?? m, m))),
    );
    expect(mixed.map((g) => g.label)).toEqual([]);
  }, 30_000);
});

// Fifteen services where nearly every pair talks.
const MESH = lines(
  "flowchart LR",
  ...Array.from({ length: 15 }, (_, i) =>
    Array.from({ length: 15 - i - 1 }, (_, k) => i + k + 1)
      .filter((j) => (i + j) % 7 !== 0)
      .map((j) => `  n${i} --- n${j}`),
  ).flat(),
);

describe("a dense mesh", () => {
  test(
    "is refused with the reason a matrix reads better, never offered as a hairball",
    async () => {
      for (const preset of ["low-density", "medium-density", "high-density"]) {
        const out = await splitOutcome(MESH, configFromPreset(preset));
        expect(out.plan).toBeNull();
        expect(out.reason).toBe("dense mesh: a matrix or table reads better than a diagram");
      }
    },
    SLOW,
  );
});

describe("a state every failure path ends at", () => {
  test("stays in view when everything it leads to leads nowhere", async () => {
    const work = await workOf(ORDERS);
    expect(terminalsOf(work).has("Cancelled")).toBe(true);
    expect(terminalsOf(work).has("Refunded")).toBe(true);
    // Completed loops back through Disputed, so it is no terminal.
    expect(terminalsOf(work).has("Completed")).toBe(false);
  });

  test(
    "is drawn in the overview, not inside the happy path's group",
    async () => {
      const plan = await planOf(ORDERS, configFromPreset("low-density"));
      expect(plan.overview.nodes.map((n) => n.id)).toContain("Cancelled");
    },
    SLOW,
  );
});

describe("a detail", () => {
  test(
    "draws two edges from one outside group into one member from two stubs",
    async () => {
      const plan = await planOf(DECISIONS.source, configFromPreset("low-density"));
      for (const d of plan.details) {
        const drawn = d.source.split("\n").filter((l) => l.includes("-->"));
        expect(drawn.length).toBe(new Set(drawn).size);
      }
      const fraud = plan.details.find((d) => d.graph.nodes.some((n) => n.id === "fraud"));
      const into = fraud?.graph.edges.filter((e) => e.target === "fraud" && fraud.stubs[e.source] !== undefined) ?? [];
      expect(into.length).toBe(2);
      expect(new Set(into.map((e) => e.source)).size).toBe(2);
    },
    SLOW,
  );
});

// The Stripe billing object model: INVOICE has two identifying parents, so it
// roots an aggregate of its own, joined to ACCOUNT's by five relationships.
const SAAS = lines(
  "erDiagram",
  "  ACCOUNT ||--o{ CUSTOMER : owns",
  "  CUSTOMER ||--o{ SUBSCRIPTION : holds",
  "  SUBSCRIPTION ||--|{ SUBSCRIPTION_ITEM : contains",
  '  SUBSCRIPTION_ITEM }o..|| PRICE : "billed at"',
  '  PRICE }o--|| PRODUCT : "prices"',
  '  PRICE ||--o{ PRICE_TIER : "tiered by"',
  "  SUBSCRIPTION_ITEM ||--o{ USAGE_RECORD : meters",
  "  SUBSCRIPTION ||--o{ INVOICE : generates",
  '  CUSTOMER ||--o{ INVOICE : "billed via"',
  "  INVOICE ||--|{ INVOICE_LINE : itemises",
  '  INVOICE_LINE }o..o| SUBSCRIPTION_ITEM : "from item"',
  '  INVOICE_LINE }o..o| PRICE : "at price"',
  '  INVOICE ||--o| PAYMENT_INTENT : "collected by"',
  "  PAYMENT_INTENT ||--o{ CHARGE : attempts",
  '  CHARGE ||--o{ REFUND : "reversed by"',
  '  CHARGE ||--o| DISPUTE : "disputed in"',
  "  CUSTOMER ||--o{ PAYMENT_METHOD : saves",
  "  PAYMENT_INTENT }o..|| PAYMENT_METHOD : uses",
  "  SUBSCRIPTION }o..o| COUPON : discounts",
  '  COUPON ||--o{ PROMOTION_CODE : "redeemed via"',
  "  CUSTOMER ||--o{ CREDIT_NOTE : receives",
  "  CREDIT_NOTE }o..|| INVOICE : adjusts",
  "  CUSTOMER ||--o{ TAX_ID : registers",
  "  INVOICE }o..o{ TAX_RATE : applies",
  '  SUBSCRIPTION ||--o| SUBSCRIPTION_SCHEDULE : "phased by"',
  "  ACCOUNT ||--o{ WEBHOOK_ENDPOINT : configures",
  "  WEBHOOK_ENDPOINT ||--o{ EVENT_DELIVERY : delivers",
);

const pairsOf = (plan: SplitPlan): string[] =>
  plan.overview.edges.map((e) => [e.source, e.target].sort().join("\u0000"));

describe("an overview", () => {
  test(
    "draws the parallel edges between two nodes side by side, whichever way each is written",
    async () => {
      const source = readFileSync(join(import.meta.dir, "cases", "round9", "er01-ecommerce.mmd"), "utf8");
      const plan = await planOf(source, configFromPreset("low-density"));
      const pairs = pairsOf(plan);
      const runs = pairs.filter((p, i) => i === 0 || pairs[i - 1] !== p);
      expect(runs.length).toBe(new Set(pairs).size);
      expect(pairs.length).toBeGreaterThan(runs.length);
    },
    SLOW,
  );

  test(
    "takes a fold nearly as good that leaves no parallel edges over one that leaves five",
    async () => {
      const plan = await planOf(SAAS, configFromPreset("medium-density"));
      expect(pairsOf(plan).length).toBe(new Set(pairsOf(plan)).size);
    },
    SLOW,
  );
});

describe("a decision region hiding one node", () => {
  test(
    "is undone when the overview and every detail still meet the target without it",
    async () => {
      const plan = await planOf(DECISIONS.source, configFromPreset("high-density"));
      const thin = plan.groups.filter((g) => g.reason === "decision region" && g.members.length < 3);
      expect(thin).toEqual([]);
      expect(plan.overview.nodes.map((n) => n.id)).toContain("signed");
    },
    SLOW,
  );
});

describe("a decision region that ends the flow", () => {
  test(
    "stays in view under a large target, so the overview ends at its outcomes",
    async () => {
      const plan = await planOf(DECISIONS.source, configFromPreset("high-density"));
      const ids = plan.overview.nodes.map((n) => n.id);
      expect(ids).toContain("disburse");
      expect(ids).toContain("expired");
    },
    SLOW,
  );
});
