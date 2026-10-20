// What the round-12 blind rating held plans to (MJL-0034): a plan refused
// because a list or a table reads better prints that list or table, drawing
// every node and edge; an aggregate folds only where it draws no relationship
// beside another, and in a schema met by dropping rows only tight aggregates
// fold. Round 13 (MJL-0035) folds a pipeline by lane again and an author
// region whole however much of the diagram it holds: round13.test.ts.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMarkdown } from "../../src/index.ts";
import { extractGraph } from "../../src/parse/graph.ts";
import { configFromPreset, PRESET_NAMES } from "../../src/parse/metrics.ts";
import { SPLIT_RULES } from "../../src/rules/complexity.ts";
import type { RuleId } from "../../src/rules/types.ts";
import { meshMatrix, starList } from "../../src/split/alternative.ts";
import { DENSE_MESH, STAR, splitOutcome } from "../../src/split/index.ts";
import { foldedParallels, quotientEdges } from "../../src/split/quotient.ts";
import type { SplitAlternative, SplitPlan } from "../../src/split/types.ts";
import { outcomeLines } from "../../src/split-report.ts";
import { unfaithful } from "./alternatives.ts";
import { checkPlan } from "./checker.ts";
import { faithful } from "./faithful.ts";
import { workOf } from "./helpers.ts";

const SLOW = 60_000;
const CASES = join(import.meta.dir, "cases");
const read = (name: string): string => readFileSync(join(CASES, "round12", `${name}.mmd`), "utf8");
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

const alternativeOf = async (source: string, preset: string): Promise<SplitAlternative> => {
  const out = await splitOutcome(source, configFromPreset(preset));
  expect(out.plan).toBeNull();
  if (!out.alternative) throw new Error(`no alternative: ${out.reason}`);
  return out.alternative;
};

// A star whose labels hold markdown, html, an entity and a pipe, two leaves
// alike, labelled, dotted, thick and undirected links, a loop, a link
// between two leaves, a subgraph as an end and a node nothing links.
const TRICKY = lines(
  "flowchart LR",
  '  hub["Hub *core* | main"]',
  '  a["auth_service <b>v2</b>"] --> hub',
  '  b["# not a heading"] --> hub',
  '  hub -->|"calls *fast*"| c["1. ordered?"]',
  '  hub -.-> d["dup"]',
  '  hub ==> e["dup"]',
  '  hub --- f["back`tick` &amp; co"]',
  "  hub <--> g[g]",
  "  hub --> hub",
  "  c --> d",
  "  hub --> box",
  "  lone[Nothing links me]",
  "  subgraph box[Box]",
  "    inner[Inner]",
  "  end",
);

// Every pair of six nodes linked both ways, some labelled.
const MESH = lines(
  "flowchart LR",
  ...["a", "b", "c", "d", "e", "f"].flatMap((x, i, all) =>
    all.slice(i + 1).flatMap((y) => [`  ${x} -->|"${x} to ${y}"| ${y}`, `  ${y} --> ${x}`]),
  ),
);

describe("a plan refused because a list or a table reads better", () => {
  test(
    "a star prints its hub and every leaf as a list, faithful to the graph",
    async () => {
      const source = read("flow06-gateway-hub-spoke");
      const out = await splitOutcome(source, configFromPreset("medium"));
      expect(out.reason).toBe(STAR);
      const alt = await alternativeOf(source, "medium");
      expect(alt.kind).toBe("list");
      expect(alt.markdown).toStartWith("- **Kong API gateway**, 37 links:\n  - Into it (3):\n    - Mobile app");
      expect(unfaithful(await extractGraph(source), alt)).toEqual([]);
    },
    SLOW,
  );

  test(
    "a dense mesh prints every link as an adjacency matrix, faithful to the graph",
    async () => {
      const source = read("flow07-service-mesh");
      for (const preset of PRESET_NAMES) {
        const out = await splitOutcome(source, configFromPreset(preset));
        expect(out.reason).toBe(DENSE_MESH);
        expect(out.alternative?.kind).toBe("matrix");
      }
      const alt = await alternativeOf(source, "high");
      expect(alt.markdown).toStartWith("15 nodes, 94 of 105 pairs linked by 94 edges. Not linked: Orders and Search;");
      expect(unfaithful(await extractGraph(source), alt)).toEqual([]);
      expect(unfaithful(await extractGraph(MESH), await alternativeOf(MESH, "low"))).toEqual([]);
    },
    SLOW,
  );
});

describe("a list or matrix read back through mdast", () => {
  test("a list or matrix draws markup, duplicates, kinds, loops and loose nodes as written", async () => {
    const graph = await extractGraph(TRICKY);
    const list = starList(graph);
    expect(unfaithful(graph, list)).toEqual([]);
    expect(list.markdown).toContain("- **Nothing links me**, no links");
    expect(list.markdown).toContain("dup (`d`)");
    expect(unfaithful(graph, meshMatrix(graph))).toEqual([]);
    const classes = await extractGraph(
      lines("classDiagram", "  A <|-- B", "  A *-- C : owns", "  B ..> C", "  C -- D", "  D o-- A"),
    );
    expect(unfaithful(classes, starList(classes))).toEqual([]);
    expect(unfaithful(classes, meshMatrix(classes))).toEqual([]);
    const er = await extractGraph(lines("erDiagram", "  A ||--o{ B : has", "  B }o--|| C : in", "  C ||--|| A : is"));
    expect(unfaithful(er, starList(er))).toEqual([]);
    expect(unfaithful(er, meshMatrix(er))).toEqual([]);
  });

  test("the reader catches a dropped edge, a reversed one and a cell that does not mirror", async () => {
    const graph = await extractGraph(MESH);
    const matrix = meshMatrix(graph);
    const dropped = { ...matrix, markdown: matrix.markdown.replace("→ *a to b*<br>", "") };
    expect(unfaithful(graph, dropped).some((p) => p.includes("not drawn"))).toBe(true);
    const star = starList(await extractGraph(TRICKY));
    const reversed = { ...star, markdown: star.markdown.replace("Into it (2):", "Out of it (2):") };
    expect(unfaithful(await extractGraph(TRICKY), reversed).length).toBeGreaterThan(0);
  });
});

// Every refused star or mesh among the case sets is read back against its
// graph in checker.test.ts, which plans each case once.
describe("a refused star or mesh on the command line", () => {
  test(
    "--split-plan prints the list or matrix after the reason, and the remediation points to it",
    async () => {
      const source = read("flow07-service-mesh");
      const out = await splitOutcome(source, configFromPreset("high"));
      const printed = outcomeLines("a.md:1", out).join("\n");
      expect(printed).toContain(
        "Dense mesh: a matrix or table reads better than a diagram.\n\nIn its place, every link as an adjacency matrix:\n\n15 nodes,",
      );
      const found = await checkMarkdown(`\`\`\`mermaid\n${source}\n\`\`\`\n`, "doc.md");
      const hit = found.find((f) => SPLIT_RULES.has(f.rule as RuleId));
      expect(hit?.remediation).toEndWith(
        " A table reads better than a split: --split-plan prints every link as an adjacency matrix.",
      );
    },
    SLOW,
  );
});

describe("an erDiagram aggregate", () => {
  // Each overview edge at a group reaches another end, but for the original's
  // own relationships side by side.
  const sideBySide = (plan: SplitPlan): string[] => {
    const ids = new Set(plan.groups.map((g) => g.id));
    const seen = new Map<string, number>();
    for (const e of plan.overview.edges) {
      if (!(ids.has(e.source) || ids.has(e.target))) continue;
      const pair = [e.source, e.target].sort().join("/");
      seen.set(pair, (seen.get(pair) ?? 0) + 1);
    }
    return [...seen].filter(([, n]) => n > 1).map(([p]) => p);
  };

  test(
    "folds a shared lookup chain alone, never into one owner, drawing no relationship twice",
    async () => {
      const plan = await planOf(read("er04-sakila"), "medium");
      const chain = plan.groups.find((g) => g.members.includes("ADDRESS"));
      expect(chain?.members).toEqual(["ADDRESS", "CITY", "COUNTRY"]);
      expect(chain?.labelBase).toBe("ADDRESS");
      expect(plan.groups.some((g) => g.members.includes("STORE"))).toBe(false);
      expect(sideBySide(plan)).toEqual([]);
      expect(plan.loss.newReachablePairs).toBe(0);
    },
    SLOW,
  );

  test(
    "met by dropping rows folds only tight aggregates, with no new reachable pair",
    async () => {
      const plan = await planOf(read("er06-university"), "high");
      expect(plan.loss.newReachablePairs).toBe(0);
      expect(plan.groups.length).toBeGreaterThan(0);
      expect(Math.max(...plan.groups.map((g) => g.members.length))).toBeLessThanOrEqual(3);
      expect(sideBySide(plan)).toEqual([]);
    },
    SLOW,
  );

  test("a fold's parallel relationships count only where the original draws one", async () => {
    const work = await workOf(
      lines("erDiagram", "  A ||--o{ B : has", "  A }o..|| B : owns", "  C ||--o{ A : holds", "  C ||--o{ B : keeps"),
    );
    const none = { groups: [], groupOf: new Map(), regionOf: new Map() };
    expect(foldedParallels(work, quotientEdges(work, none))).toBe(0);
    const ab = { groups: [{ members: ["A", "B"], regions: [], parent: null, tier: "T4" as const, reason: "x" }] };
    const part = {
      ...ab,
      groupOf: new Map([
        ["A", 0],
        ["B", 0],
      ]),
      regionOf: new Map(),
    };
    expect(foldedParallels(work, quotientEdges(work, part))).toBe(1);
  });
});
