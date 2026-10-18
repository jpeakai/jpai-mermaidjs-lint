// Visual complexity: thresholds by density preset, and the score a diagram's
// structure earns. The node limits follow the cognitive load research that 50
// nodes is where a network diagram becomes hard to read and 100 is the limit
// (Huang et al. 2020, https://arxiv.org/abs/2008.07944).

import type { DiagramStats } from "./stats.ts";

export interface Preset {
  node_ideal: number;
  node_acceptable: number;
  node_complex: number;
  node_hard_limit: number;
  vcs_ideal: number;
  vcs_acceptable: number;
  vcs_complex: number;
  vcs_critical: number;
  node_target: number;
  vcs_target: number;
}

export const PRESETS: Record<string, Preset> = {
  "low-density": {
    node_ideal: 8,
    node_acceptable: 12,
    node_complex: 20,
    node_hard_limit: 35,
    vcs_ideal: 15,
    vcs_acceptable: 25,
    vcs_complex: 40,
    vcs_critical: 60,
    node_target: 10,
    vcs_target: 20,
  },
  "medium-density": {
    node_ideal: 12,
    node_acceptable: 20,
    node_complex: 35,
    node_hard_limit: 60,
    vcs_ideal: 25,
    vcs_acceptable: 40,
    vcs_complex: 70,
    vcs_critical: 100,
    node_target: 15,
    vcs_target: 30,
  },
  "high-density": {
    node_ideal: 20,
    node_acceptable: 35,
    node_complex: 50,
    node_hard_limit: 100,
    vcs_ideal: 35,
    vcs_acceptable: 60,
    vcs_complex: 100,
    vcs_critical: 150,
    node_target: 25,
    vcs_target: 40,
  },
};

export const DEFAULT_PRESET = "high-density";

const PRESET_ALIASES: Record<string, string> = {
  low: "low-density",
  l: "low-density",
  strict: "low-density",
  med: "medium-density",
  medium: "medium-density",
  m: "medium-density",
  balanced: "medium-density",
  high: "high-density",
  h: "high-density",
  permissive: "high-density",
  default: "high-density",
};

// A row (an entity's attribute, a class's member) weighs half an edge: it is
// text to read, but inside a box the reader has already found.
const VCS_WEIGHTS = { edge: 0.5, row: 0.25, subgraph: 3.0, depth: 0.1 } as const;

export interface ThresholdConfig extends Preset {
  edge_weight: number;
  row_weight: number;
  subgraph_weight: number;
  depth_weight: number;
  preset_name: string;
}

// The numeric threshold keys a rule option may override, as camelCase option
// names mapped to the preset field they replace.
export const THRESHOLD_OPTIONS = {
  nodeIdeal: "node_ideal",
  nodeAcceptable: "node_acceptable",
  nodeComplex: "node_complex",
  nodeHardLimit: "node_hard_limit",
  vcsIdeal: "vcs_ideal",
  vcsAcceptable: "vcs_acceptable",
  vcsComplex: "vcs_complex",
  vcsCritical: "vcs_critical",
  nodeTarget: "node_target",
  vcsTarget: "vcs_target",
  edgeWeight: "edge_weight",
  rowWeight: "row_weight",
  subgraphWeight: "subgraph_weight",
  depthWeight: "depth_weight",
} as const;

export const PRESET_NAMES = Object.keys(PRESETS);

export const canonicalPreset = (name: string): string | null => {
  const lower = name.toLowerCase();
  const canonical = PRESET_ALIASES[lower] ?? lower;
  return canonical in PRESETS ? canonical : null;
};

export const configFromPreset = (name: string): ThresholdConfig => {
  const canonical = canonicalPreset(name);
  const preset = canonical ? PRESETS[canonical] : undefined;
  if (!(canonical && preset)) {
    throw new Error(`Unknown preset '${name}'. Valid: ${PRESET_NAMES.join(", ")}`);
  }
  return {
    ...preset,
    edge_weight: VCS_WEIGHTS.edge,
    row_weight: VCS_WEIGHTS.row,
    subgraph_weight: VCS_WEIGHTS.subgraph,
    depth_weight: VCS_WEIGHTS.depth,
    preset_name: canonical,
  };
};

// A rule's options as thresholds: the preset first, then every numeric
// override. A run with any override is named custom.
export const thresholdsFrom = (options: Readonly<Record<string, unknown>>): ThresholdConfig => {
  const preset = typeof options.preset === "string" ? options.preset : DEFAULT_PRESET;
  const config = configFromPreset(preset);
  let customized = false;
  for (const [option, field] of Object.entries(THRESHOLD_OPTIONS)) {
    const value = options[option];
    if (typeof value === "number") {
      config[field] = value;
      customized = true;
    }
  }
  if (customized) config.preset_name = "custom";
  return config;
};

export interface ComplexityMetrics {
  visual_complexity_score: number;
  edge_density: number;
  cyclomatic_complexity: number;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

// (nodes + edges*w_e + rows*w_r + subgraphs*w_s) * (1 + depth*w_d). Edge density is
// reported as 0 below two nodes rather than dividing by a fallback, which gave
// nonsense when a parser returned edges but no nodes.
//
// The depth is subgraph nesting or, for a tree-shaped type (mindmap, treemap,
// treeView, ishikawa), tree depth; a diagram has only one of the two. A deep
// tree is as hard to follow as deep nesting, so its depth still weighs on the
// score, and the score of those types is unchanged from when tree depth was
// counted as nesting. Only complexity-subgraph-nesting-too-deep ignores it,
// because its remedy (flatten subgraphs) cannot apply to a tree.
export const calculateComplexity = (stats: DiagramStats, config: ThresholdConfig): ComplexityMetrics => {
  const n = stats.nodes;
  const e = stats.edges;
  const s = stats.subgraphs;
  const d = Math.max(stats.max_subgraph_depth, stats.max_tree_depth);
  const base = n + e * config.edge_weight + stats.rows * config.row_weight + s * config.subgraph_weight;
  const vcs = base * (1 + d * config.depth_weight);
  const maxEdges = n > 1 ? n * (n - 1) : 0;
  return {
    visual_complexity_score: round2(vcs),
    edge_density: round4(maxEdges > 0 ? e / maxEdges : 0),
    cyclomatic_complexity: Math.max(1, e - n + 2),
  };
};

// Whether a diagram failed to parse, so its metrics cannot be trusted. That is
// the parser's own say: an error, as `graph TD; A-->; B[[[` gives, or no
// diagram type mermaid detects, which mermaid reports as an error too. A
// diagram the parser read without an error parsed, even into no nodes: `pie`
// then `title Pets`, or a `sequenceDiagram` under a frontmatter title,
// legitimately have none.
export const parseFailed = (stats: DiagramStats): boolean => stats.error !== null;
