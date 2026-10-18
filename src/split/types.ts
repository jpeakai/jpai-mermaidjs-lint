// The shape of a split plan: an overview where some node sets are folded into
// one group node, plus one detail diagram per group. Overview and details
// together recover every original node and edge, which contract.ts proves
// before a plan is offered.

import type { DiagramGraph } from "../parse/graph.ts";

// The tiers, least lossy first. T1 is presentation only (rows dropped, exact
// duplicate edges merged) and folds no node.
export type Tier = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export const FOLD_TIERS: readonly Tier[] = ["T2", "T3", "T4", "T5", "T6"];

export interface SplitGroup {
  // g1, g2 and on, in the order of the sorted member tuples.
  id: string;
  // An author label, or the member with the highest degree then smallest id,
  // followed by " (+N)".
  label: string;
  // The label's two parts: the author or member label it starts with, and N.
  labelBase: string;
  hidden: number;
  members: string[];
  // The author regions folded whole into the group: flowchart subgraphs,
  // composite state boxes and class namespaces, by their graph id.
  regions: string[];
  // The region the group node sits in, or null at the top level.
  parent: string | null;
  tier: Tier;
  reason: string;
  // Every member's shape, when all members agree.
  shape?: string;
}

export interface SplitDetail {
  // The id of the group this diagram details.
  group: string;
  graph: DiagramGraph;
  // Each stub's id in this diagram, mapped to the original node, subgraph or
  // interface it stands for.
  stubs: Record<string, string>;
  source: string;
  nodes: number;
  score: number;
  // A detail too large for the target is split once more, bounded at depth 2.
  split: SplitPlan | null;
}

export interface SplitLoss {
  // Overview node pairs reachable in the overview but not in the original.
  newReachablePairs: number;
  // The same count after each tier the plan walked, as the partition stood.
  byTier: Partial<Record<Tier, number>>;
  // ER attributes and class members left out of overview and details.
  droppedRows: number;
}

export interface SplitPlan {
  diagram_type: string;
  // The last tier that changed the plan.
  tier: Tier;
  groups: SplitGroup[];
  overview: DiagramGraph;
  overviewSource: string;
  overviewNodes: number;
  overviewScore: number;
  details: SplitDetail[];
  loss: SplitLoss;
}

// Why no plan was offered, beside the plan when there is one.
export interface SplitOutcome {
  plan: SplitPlan | null;
  reason: string;
  violations: string[];
}
