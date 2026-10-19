// Public API.

export { canvasSetAside, checkMarkdown, checkModel, type RunFlags } from "./check.ts";
export { main } from "./cli.ts";
export { type Config, loadConfig, type PluginLoading, parseConfig, type RuleSetting, type Severity } from "./config.ts";
export * from "./errors.ts";
export { type Collected, collectFiles } from "./files.ts";
export { type FixReport, fixSource, fixSourceReport } from "./fix/engine.ts";
export { buildDocModel, DIAGRAM_EXTS, type Diagram, type DocModel, documentKind } from "./model.ts";
export type { ContrastAssessment, StyleDirective, ValueSpan } from "./parse/color.ts";
export { type Canvas, type CanvasSetting, GITHUB_CANVAS } from "./parse/contrast.ts";
export { PRESETS, type Preset, type ThresholdConfig, thresholdsFrom } from "./parse/metrics.ts";
export { type DiagramStats, detectKeyword, extractStats } from "./parse/stats.ts";
export type { Plugin, PluginEdit, PluginFinding, PluginMeta, PluginRule } from "./plugins/contract.ts";
export type { SourceKind } from "./plugins/discover.ts";
export type { PluginFailure } from "./plugins/index.ts";
export { findProjectRoot, type Setup, type SetupOptions, setUp } from "./project.ts";
export { FIX_ORDER, RULES } from "./rules/index.ts";
export {
  BUILTIN,
  BUILTIN_CATEGORIES,
  buildRegistry,
  type CategorySelection,
  type LoadedSource,
  type Registry,
  type RegistryInput,
} from "./rules/registry.ts";
export type {
  Category,
  CheckContext,
  CoreRuleId,
  Edit,
  Expectation,
  Finding,
  FixContext,
  Helpers,
  OptionSpec,
  OptionType,
  PluginRuleId,
  Rule,
  RuleContext,
  RuleId,
  RuleOptions,
} from "./rules/types.ts";
export { CATEGORIES, RULE } from "./rules/types.ts";
export {
  type LadderStep,
  type RowDetail,
  type SplitAlternative,
  type SplitDetail,
  type SplitGroup,
  type SplitLoss,
  type SplitOutcome,
  type SplitPlan,
  splitOutcome,
  splitPlan,
  type Tier,
} from "./split/index.ts";
