// The contract every rule implements: a check that reports findings, and an
// optional fixer that proposes edits. The fix engine, not the fixer, decides
// whether an edit is safe to keep.

import type { DocModel } from "../model.ts";
import type { compositeOver, wcagRatio } from "../parse/color.ts";
import type { detectKeyword } from "../parse/stats.ts";

export const RULE = {
  UNPARSEABLE: "parse-diagram-unparseable",
  FENCE_UNTERMINATED: "parse-fence-unterminated",
  NODES_HARD: "complexity-node-count-hard-limit",
  NODES_COGNITIVE: "complexity-node-count-cognitive-limit",
  NODES_ACCEPTABLE: "complexity-node-count-acceptable-exceeded",
  VCS_CRITICAL: "complexity-visual-score-critical",
  VCS_ACCEPTABLE: "complexity-visual-score-acceptable-exceeded",
  NESTING: "complexity-subgraph-nesting-too-deep",
  TEXT: "contrast-text-below-aa",
  BORDER: "contrast-border-below-ui-minimum",
  UNAUDITABLE: "contrast-directive-unauditable",
} as const;

export type CoreRuleId = (typeof RULE)[keyof typeof RULE];

export type Awaitable<T> = T | Promise<T>;

export type PluginRuleId = `${string}/${string}`;

// A core id has no slash. A plugin id is always namespace/name, so the slash
// is what tells the two apart.
export const isPluginRuleId = (id: string): id is PluginRuleId => id.includes("/");

export type RuleId = CoreRuleId | PluginRuleId;

// One violation. `line` and `endLine` are file lines: the fences of a diagram
// in markdown, or the first and last line of a standalone diagram file.
export interface Finding {
  file: string;
  line: number;
  endLine: number;
  rule: RuleId;
  message: string;
  // The actionable next step, shown in JSON output.
  remediation?: string;
}

// "canvas" is an object { light?, dark? } of opaque CSS colours: the page a
// diagram is drawn on. Every option of this type, whatever its name, receives
// --canvas-light and --canvas-dark, as the contrast rules do.
export type OptionType = "number" | "string" | "boolean" | "string[]" | "canvas";

export type OptionSpec = Readonly<Record<string, OptionType>>;

export type RuleOptions = Readonly<Record<string, unknown>>;

// Plain functions a plugin can use without importing this package, so a plugin
// never depends on resolving the host from its own location.
export interface Helpers {
  detectKeyword: typeof detectKeyword;
  wcagRatio: typeof wcagRatio;
  compositeOver: typeof compositeOver;
}

export interface RuleContext {
  doc: DocModel;
  file: string;
  options: RuleOptions;
  helpers: Helpers;
}

export type CheckContext = RuleContext;
export type FixContext = RuleContext;

// What the engine must be able to prove about the document after an edit.
export type Expectation =
  // Markdown is unchanged apart from the text of the mermaid fences, every
  // diagram is still there, and every diagram parses to the same structure.
  | { kind: "same-diagrams" }
  // The markdown tree is unchanged once text whitespace is collapsed.
  | { kind: "same-tree" };

export interface Edit {
  rule: RuleId;
  start: number;
  end: number;
  text: string;
  expect: Expectation;
}

// What a rule guards, so related rules read as a group in help and RULES.md.
// parse: whether mermaid can read the diagram, and whether its fence is whole.
// complexity: how much a reader must hold in mind at once.
// contrast: whether labels and borders can be read against their fills.
// A plugin may add a category of its own by declaring it.
export const CATEGORIES = ["parse", "complexity", "contrast"] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Rule {
  id: RuleId;
  category: string;
  summary: string;
  options?: OptionSpec;
  check: (ctx: CheckContext) => Awaitable<Finding[]>;
  // Absent for rules whose fix needs discretion, such as every complexity rule.
  fix?: (ctx: FixContext) => Awaitable<Edit[]>;
}
