// Split plans: for a diagram over its density target, an overview where some
// node sets fold into group nodes, plus one detail diagram per group, offered
// only when contract.ts proves the pair recovers the original. Nothing is
// applied; a plan is a recommendation (MJL-0004).

import { extractGraph } from "../parse/graph.ts";
import { calculateComplexity, type ThresholdConfig } from "../parse/metrics.ts";
import { extractStats, getMermaidCore } from "../parse/stats.ts";
import { checkContract } from "./contract.ts";
import { buildWorkGraph, familyOf, type WorkGraph } from "./graph.ts";
import { laddersOf, planWork } from "./plan.ts";
import { meets } from "./quotient.ts";
import type { SplitOutcome, SplitPlan } from "./types.ts";

export type {
  LadderStep,
  RowDetail,
  SplitDetail,
  SplitGroup,
  SplitLoss,
  SplitOutcome,
  SplitPlan,
  Tier,
} from "./types.ts";

const refuse = (reason: string, violations: string[] = []): SplitOutcome => ({ plan: null, reason, violations });

// The direction, as mermaid's own parser read it. The graph does not carry
// it, and an emitted diagram keeps it.
export const directionOf = async (source: string): Promise<string> => {
  const mermaid = await getMermaidCore();
  const diagram = (await mermaid.mermaidAPI.getDiagramFromText(source)) as { db: Record<string, unknown> };
  const read = diagram.db.getDirection;
  return typeof read === "function" ? String(read.call(diagram.db) ?? "") : "";
};

// A plan, or why there is none: out of scope, already within target, no tier
// reaching the target, or the contract's violations.
export const splitOutcome = async (source: string, config: ThresholdConfig): Promise<SplitOutcome> => {
  const stats = await extractStats(source);
  if (stats.error !== null) return refuse(`the diagram does not parse: ${stats.error}`);
  if (stats.diagram_type === "sequence")
    return refuse("a sequence diagram is not split: its graph drops message order");
  const family = familyOf(stats.diagram_type);
  if (!family) return refuse(`a ${stats.diagram_type} diagram is not split`);
  if (meets(stats.nodes, calculateComplexity(stats, config).visual_complexity_score, config)) {
    return refuse("the diagram is already within the target");
  }
  const graph = await extractGraph(source);
  const counts = [graph.nodes.length, graph.edges.length, graph.subgraphs.length].join("/");
  if (counts !== [stats.nodes, stats.edges, stats.subgraphs].join("/"))
    return refuse("the graph does not count what the stats count");
  // A detail or overview would draw a composite's regions as one, which the
  // emitted text cannot tell apart, so no plan is offered.
  if (graph.subgraphs.some((s) => (s.regions ?? 0) > 1)) return refuse("concurrent state regions are not split");
  const work = buildWorkGraph(graph, { direction: await directionOf(source), rows: stats.rows });
  return firstPassing(work, config);
};

// The plan of the first ladder that passes the contract: author regions
// first when the diagram has them, then the default ladder. With none, the
// last ladder's reason.
const firstPassing = async (work: WorkGraph, config: ThresholdConfig): Promise<SplitOutcome> => {
  let outcome = refuse("no ladder was walked");
  for (const order of laddersOf(work)) {
    const built = planWork(work, config, 1, order);
    if (typeof built === "string") {
      outcome = refuse(built);
      continue;
    }
    const violations = await checkContract(built, config);
    if (violations.length === 0) return { plan: built.plan, reason: "", violations: [] };
    outcome = refuse("the plan breaks the contract", violations);
  }
  return outcome;
};

export const splitPlan = async (source: string, config: ThresholdConfig): Promise<SplitPlan | null> =>
  (await splitOutcome(source, config)).plan;
