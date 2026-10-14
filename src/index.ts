// Public API.

export { checkMarkdown, checkModel, type RunFlags } from "./check.ts";
export { main } from "./cli.ts";
export { type Config, loadConfig, type PluginLoading, parseConfig, type RuleSetting, type Severity } from "./config.ts";
export * from "./errors.ts";
export { collectFiles } from "./files.ts";
export { type FixReport, fixSource, fixSourceReport } from "./fix/engine.ts";
export { buildDocModel, type Diagram, type DocModel } from "./model.ts";
export type { ContrastAssessment, StyleDirective, ValueSpan } from "./parse/color.ts";
export { PRESETS, thresholdsFrom } from "./parse/metrics.ts";
export { type DiagramStats, detectKeyword, extractStats } from "./parse/stats.ts";
export type { Plugin, PluginEdit, PluginFinding, PluginMeta, PluginRule } from "./plugins/contract.ts";
export { findProjectRoot, setUp } from "./project.ts";
export { FIX_ORDER, RULES } from "./rules/index.ts";
export {
  BUILTIN,
  BUILTIN_CATEGORIES,
  buildRegistry,
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
