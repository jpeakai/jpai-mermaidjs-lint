// Decision regions: dominators by Cooper, Harvey and Kennedy, the
// single-entry single-exit regions they give, and the plans that fold them.

import { describe, expect, test } from "bun:test";
import { DECISIONS } from "../../scripts/split-steps.ts";
import { configFromPreset, PRESET_NAMES } from "../../src/parse/metrics.ts";
import { checkContract } from "../../src/split/contract.ts";
import { dominates, immediateDominators } from "../../src/split/dominators.ts";
import { flowRegionsOf } from "../../src/split/flow.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { splitsBranches } from "../../src/split/rules.ts";
import { faithful } from "./faithful.ts";
import { buildOf, lines, target, workOf } from "./helpers.ts";

const graphOf = (edges: Array<[string, string]>) => {
  const next = (v: string): string[] => edges.filter(([a]) => a === v).map(([, b]) => b);
  const prev = (v: string): string[] => edges.filter(([, b]) => b === v).map(([a]) => a);
  return { next, prev };
};

const regionsOf = async (source: string): Promise<string[]> =>
  flowRegionsOf(await workOf(source)).map((r) => `${r.head}>${r.exit ?? "end"}:${r.members.join(",")}`);

describe("immediate dominators", () => {
  test("meet where two paths join, and a loop does not move them", () => {
    const { next, prev } = graphOf([
      ["r", "a"],
      ["r", "b"],
      ["a", "c"],
      ["b", "c"],
      ["c", "d"],
      ["d", "a"],
      ["d", "e"],
    ]);
    const idom = immediateDominators("r", next, prev);
    expect(Object.fromEntries(idom)).toEqual({ r: "r", a: "r", b: "r", c: "r", d: "c", e: "d" });
    expect(dominates(idom, "c", "e")).toBe(true);
    expect(dominates(idom, "a", "c")).toBe(false);
    expect(dominates(idom, "r", "r")).toBe(true);
  });

  test("leave out what the root does not reach", () => {
    const { next, prev } = graphOf([
      ["r", "a"],
      ["x", "a"],
    ]);
    expect([...immediateDominators("r", next, prev).keys()].sort()).toEqual(["a", "r"]);
  });
});

describe("decision regions", () => {
  test("run from a decision to where its branches rejoin", async () => {
    const diamond = lines("flowchart TD", "  s --> d{ok?}", "  d -->|yes| a --> j", "  d -->|no| b --> j", "  j --> e");
    expect(await regionsOf(diamond)).toEqual(["d>j:a,b,d"]);
  });

  test("hold a branch that ends the flow, and a loop back to the decision", async () => {
    const guard = lines(
      "flowchart TD",
      "  s --> d{valid?}",
      "  d -->|no| fix[Fix it] --> w{in time?}",
      "  w -->|no| stop([Give up])",
      "  w -->|yes| d",
      "  d -->|yes| n[Next] --> e([Done])",
    );
    expect(await regionsOf(guard)).toEqual(["w>d:stop,w", "d>n:d,fix,stop,w"]);
  });

  test("end at the flow's end when every branch does", async () => {
    expect(await regionsOf(lines("flowchart TD", "  s --> d{ok?}", "  d -->|y| a", "  d -->|n| b"))).toEqual([
      "d>end:a,b,d",
    ]);
  });
});

describe("decision regions are refused or kept apart", () => {
  test("are refused when an edge enters a branch from outside", async () => {
    const twoDoors = lines(
      "flowchart TD",
      "  s --> d{ok?}",
      "  d -->|yes| a --> j",
      "  d -->|no| b --> j",
      "  s --> b",
    );
    expect(await regionsOf(twoDoors)).toEqual([]);
  });

  test("are refused when a branch leaves an author region", async () => {
    const crossing = lines(
      "flowchart TD",
      "  subgraph X",
      "    d{ok?} -->|yes| a",
      "  end",
      "  d -->|no| b",
      "  a --> j",
      "  b --> j",
    );
    expect(await regionsOf(crossing)).toEqual([]);
  });

  test("start at a choice state, and never in an erDiagram", async () => {
    const choice = lines(
      "stateDiagram-v2",
      "  [*] --> Check",
      "  state pick <<choice>>",
      "  Check --> pick",
      "  pick --> Small : under 10",
      "  pick --> Large : 10 or more",
      "  Small --> Ship",
      "  Large --> Ship",
      "  Ship --> [*]",
    );
    expect(await regionsOf(choice)).toEqual(["pick>Ship:Large,pick,Small"]);
    expect(await regionsOf(lines("erDiagram", "  A ||--o{ B : has", "  A ||--o{ C : has"))).toEqual([]);
  });

  test("keep a decision's branches together when the group holds its whole region", async () => {
    const work = await workOf(
      lines("flowchart TD", "  s --> d{ok?}", "  d -->|y| a --> j", "  d -->|n| b --> j", "  j --> e"),
    );
    expect(splitsBranches(work, ["a", "b"])).toBe(true);
    expect(splitsBranches(work, ["a", "b", "d"])).toBe(false);
  });
});

describe("a decision-heavy flowchart", () => {
  test("gets a plan under every preset, folding decisions with their regions", async () => {
    for (const preset of PRESET_NAMES) {
      const config = configFromPreset(preset);
      const out = await splitOutcome(DECISIONS.source, config);
      expect(out.violations).toEqual([]);
      if (!out.plan) throw new Error(`${preset}: ${out.reason}`);
      expect(await faithful(DECISIONS.source, out.plan)).toEqual([]);
      const regions = out.plan.groups.filter((g) => g.reason === "decision region");
      expect(regions.length).toBeGreaterThan(0);
      expect(out.plan.loss.byTier.T2).toBe(0);
    }
  });

  test("names each decision region after its decision", async () => {
    const out = await splitOutcome(DECISIONS.source, configFromPreset("medium-density"));
    const work = await workOf(DECISIONS.source);
    for (const g of out.plan?.groups.filter((x) => x.reason === "decision region") ?? []) {
      const region = flowRegionsOf(work).find((r) => r.members.join() === g.members.join());
      expect(g.labelBase).toBe(work.nodes.get(region?.head ?? "")?.label ?? "");
    }
  });

  test("keeps the branch labels inside the detail", async () => {
    const plan = (await splitOutcome(DECISIONS.source, configFromPreset("high-density"))).plan;
    const kyc = plan?.details.find((d) => d.graph.nodes.some((n) => n.id === "kycwait"));
    expect(kyc?.source).toContain('kycwait -->|"No"| declinekyc');
  });
});

describe("check 6 on a decision region", () => {
  const SOURCE = lines(
    "flowchart LR",
    "  s[Start] --> d{Valid?}",
    "  d -->|no| x([Reject])",
    "  d -->|yes| a[Accept] --> b[Book] --> c[Confirm] --> e[Email] --> f[File]",
  );
  const CONFIG = target(4, 9);

  test("passes a group holding the whole region", async () => {
    const build = await buildOf(SOURCE, CONFIG);
    expect(build.plan.groups.some((g) => g.members.includes("d"))).toBe(true);
    expect(await checkContract(build, CONFIG)).toEqual([]);
  });

  test("rejects a group holding the decision without its whole region", async () => {
    const build = structuredClone(await buildOf(SOURCE, CONFIG));
    const g = build.plan.groups.find((x) => x.members.includes("d"));
    if (!g) throw new Error("no group holds the decision");
    g.members = g.members.filter((m) => m !== "x");
    const violations = await checkContract(build, CONFIG);
    expect(violations.some((v) => v.startsWith("6:"))).toBe(true);
  });
});
