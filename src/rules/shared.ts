// What several rules read in common: a diagram's measured complexity and its
// contrast pairs, derived once per diagram and shared, so two rules can never
// disagree about what the same diagram holds.

import { CanvasProfileError } from "../errors.ts";
import type { Diagram } from "../model.ts";
import {
  type Canvas,
  type CanvasSetting,
  type ContrastResult,
  canvasColourProblem,
  detectProfile,
  GITHUB_CANVAS,
  PROFILES,
  type Profile,
  resolveCanvas,
  scoreDiagram,
  THEMES,
} from "../parse/contrast.ts";
import { type ComplexityMetrics, calculateComplexity, parseFailed, type ThresholdConfig } from "../parse/metrics.ts";
import type { DiagramStats } from "../parse/stats.ts";
import type { Finding, OptionSpec, RuleContext, RuleId } from "./types.ts";

// Every complexity rule takes the same options: a preset, then any threshold.
export const COMPLEXITY_OPTIONS: OptionSpec = {
  preset: "string",
  nodeIdeal: "number",
  nodeAcceptable: "number",
  nodeComplex: "number",
  nodeHardLimit: "number",
  vcsIdeal: "number",
  vcsAcceptable: "number",
  vcsComplex: "number",
  vcsCritical: "number",
  nodeTarget: "number",
  vcsTarget: "number",
  edgeWeight: "number",
  subgraphWeight: "number",
  depthWeight: "number",
};

export const CONTRAST_OPTIONS: OptionSpec = { profile: "string", canvas: "canvas" };

export interface Measured {
  stats: DiagramStats;
  metrics: ComplexityMetrics;
}

// The stats and score of a diagram, or null when the parser could not read it.
// An unparseable diagram has no trustworthy metrics, so no threshold rule is
// evaluated against it.
export const measure = async (diagram: Diagram, config: ThresholdConfig): Promise<Measured | null> => {
  const stats = await diagram.stats();
  if (parseFailed(diagram.source, stats)) return null;
  return { stats, metrics: calculateComplexity(stats, config) };
};

export const finding = (
  ctx: RuleContext,
  diagram: Diagram,
  rule: RuleId,
  message: string,
  remediation?: string,
): Finding => ({
  file: ctx.file,
  line: diagram.startLine,
  endLine: diagram.endLine,
  rule,
  message,
  ...(remediation !== undefined && { remediation }),
});

export const boundaryHint = (boundaries: string[]): string => {
  if (boundaries.length === 0) return "introduce subgraphs to group related nodes before splitting";
  const shown = boundaries.slice(0, 4);
  const extra = boundaries.length > shown.length ? ` (+${boundaries.length - shown.length} more)` : "";
  return `along existing subgraph boundaries: ${shown.join(", ")}${extra}`;
};

export const splitTarget = (c: ThresholdConfig): string =>
  `Target at most ${c.node_target} nodes and ${c.vcs_target} VCS per sub-diagram.`;

// The profile a contrast rule scores under: the option, or auto, which reads
// the render context from the file's ancestors.
export const profileOf = (ctx: RuleContext): Profile => {
  const wanted = ctx.options.profile ?? "auto";
  if (!PROFILES.includes(wanted as (typeof PROFILES)[number])) {
    throw new Error(`profile must be one of ${PROFILES.join(", ")}, not "${String(wanted)}"`);
  }
  return wanted === "auto" ? detectProfile(ctx.file) : (wanted as Profile);
};

// How a contrast rule scores a file: the profile, and the page canvas behind
// anything page-backed.
export interface ContrastSettings {
  profile: Profile;
  canvas: Canvas;
}

// The profile and canvas a contrast rule scores under. A canvas is GitHub's
// unless the canvas option sets a side. Under mkdocs-material the page is
// Material's own, so a canvas there is refused rather than ignored.
export const settingsOf = (ctx: RuleContext): ContrastSettings => {
  const profile = profileOf(ctx);
  const setting = ctx.options.canvas as CanvasSetting | undefined;
  if (setting === undefined) return { profile, canvas: GITHUB_CANVAS };
  for (const side of THEMES) {
    if (!(side in setting)) continue;
    const problem = canvasColourProblem(setting[side]);
    if (problem) throw new Error(`canvas.${side} ${problem}: ${JSON.stringify(setting[side])}`);
  }
  if (profile === "mkdocs-material") throw new CanvasProfileError(ctx.file);
  return { profile, canvas: resolveCanvas(setting) };
};

const scored = new WeakMap<Diagram, Map<string, Promise<ContrastResult>>>();

// Scored once per diagram, profile and canvas. A sequence diagram is scored by
// its theme variables, which Mermaid resolves asynchronously.
export const contrastOf = (diagram: Diagram, settings: ContrastSettings): Promise<ContrastResult> => {
  const { profile, canvas } = settings;
  const key = `${profile}\u0000${canvas.light}\u0000${canvas.dark}`;
  let bySettings = scored.get(diagram);
  if (!bySettings) {
    bySettings = new Map();
    scored.set(diagram, bySettings);
  }
  let result = bySettings.get(key);
  if (!result) {
    result = scoreDiagram(diagram.source, diagram.directives, profile, diagram.keyword, canvas);
    bySettings.set(key, result);
  }
  return result;
};

// Maps a diagram-relative line to a file line.
export const fileLine = (diagram: Diagram, line: number): number => diagram.firstLine + line - 1;
