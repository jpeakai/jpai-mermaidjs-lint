// The registry: the rules a run actually uses. It starts from the built-in
// catalogue, adds whatever plugins loaded, then applies the config, so a rule
// that is off loses its check and its fixer together. Every check and fix reads
// the registry, which is what lets a plugin rule behave as a built-in. The CLI
// help reads the built-in catalogue directly.

import type { Config } from "../config.ts";
import { RuleOptionError, UnknownRuleError } from "../errors.ts";
import { compositeOver, wcagRatio } from "../parse/color.ts";
import { canvasColourProblem, PROFILES, THEMES, type Theme } from "../parse/contrast.ts";
import { canonicalPreset } from "../parse/metrics.ts";
import { detectKeyword } from "../parse/stats.ts";
import { FIX_ORDER, RULES } from "./index.ts";
import { type Helpers, isPluginRuleId, type OptionType, type Rule, type RuleId, type RuleOptions } from "./types.ts";

export const BUILTIN_CATEGORIES: ReadonlyMap<string, string> = new Map([
  ["parse", "Whether mermaid can read the diagram, and whether its fence is whole"],
  ["complexity", "How much a reader must hold in mind at once"],
  ["contrast", "Whether labels and borders can be read against their fills"],
]);

export const HELPERS: Helpers = { detectKeyword, wcagRatio, compositeOver };

// Where a group of rules came from, for the line each run prints.
export interface LoadedSource {
  kind: "local" | "package" | "config";
  spec: string;
  namespace: string;
  rules: RuleId[];
}

export interface Registry {
  rules: Rule[];
  fixOrder: Rule[];
  enabled: ReadonlySet<RuleId>;
  options: ReadonlyMap<RuleId, RuleOptions>;
  categories: ReadonlyMap<string, string>;
  sources: LoadedSource[];
  // Config settings dropped because they name a plugin rule that did not load.
  ignoredSettings: string[];
}

export interface RegistryInput {
  rules: Rule[];
  fixOrder: Rule[];
  categories: ReadonlyMap<string, string>;
  sources?: LoadedSource[];
  config?: Config;
  // A lenient or collect (validating) run drops a setting for an unloaded
  // plugin rule instead of failing. A built-in id always fails.
  ignoreUnknownPluginIds?: boolean;
}

const typeOf = (value: unknown): OptionType | null => {
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return "string[]";
  if (isCanvasShape(value)) return "canvas";
  return null;
};

// An object naming light, dark or both, and nothing else. Its colours are
// checked after the shape, so the message can say which side is wrong.
const isCanvasShape = (value: unknown): value is Record<Theme, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => THEMES.includes(k as Theme));
};

const describeType = (want: OptionType): string =>
  want === "canvas" ? 'an object such as { "light": "#ffffff", "dark": "#0d1117" }' : `a ${want}`;

const checkCanvas = (where: string, rule: Rule, name: string, value: Record<Theme, unknown>): void => {
  for (const side of THEMES) {
    if (!(side in value)) continue;
    const problem = canvasColourProblem(value[side]);
    if (problem) {
      throw new RuleOptionError(
        where,
        rule.id,
        name,
        `option "${name}.${side}" of "${rule.id}" ${problem}: ${JSON.stringify(value[side])}`,
      );
    }
  }
};

const checkOptions = (where: string, rule: Rule, options: RuleOptions): void => {
  const accepted = Object.keys(rule.options ?? {});
  for (const [name, value] of Object.entries(options)) {
    const want = rule.options?.[name];
    if (!want) {
      const list = accepted.length > 0 ? `it accepts ${accepted.join(", ")}` : "it takes no options";
      throw new RuleOptionError(where, rule.id, name, `rule "${rule.id}" has no option "${name}"; ${list}`);
    }
    if (typeOf(value) !== want) {
      throw new RuleOptionError(where, rule.id, name, `option "${name}" of "${rule.id}" must be ${describeType(want)}`);
    }
    if (want === "canvas") checkCanvas(where, rule, name, value as Record<Theme, unknown>);
  }
  // Material draws its own page, so a canvas has nothing to set there.
  if (options.profile === "mkdocs-material" && options.canvas !== undefined && rule.options?.canvas === "canvas") {
    throw new RuleOptionError(
      where,
      rule.id,
      "canvas",
      `option "canvas" of "${rule.id}" applies under the github profile only, and this rule sets profile mkdocs-material, whose page is Material's own`,
    );
  }
  if (typeof options.preset === "string" && canonicalPreset(options.preset) === null) {
    throw new RuleOptionError(where, rule.id, "preset", `option "preset" of "${rule.id}" is not a known preset`);
  }
  if (typeof options.profile === "string" && !PROFILES.includes(options.profile as (typeof PROFILES)[number])) {
    throw new RuleOptionError(
      where,
      rule.id,
      "profile",
      `option "profile" of "${rule.id}" must be one of ${PROFILES.join(", ")}`,
    );
  }
};

export const buildRegistry = (input: RegistryInput): Registry => {
  const { rules, fixOrder, categories, sources = [], config, ignoreUnknownPluginIds = false } = input;
  const off = new Set<string>();
  const options = new Map<RuleId, RuleOptions>();
  const ignored: string[] = [];
  const where = config?.file ?? "config";
  for (const [id, setting] of config?.rules ?? []) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) {
      // A plugin that was skipped cannot have its rules configured, so a lenient
      // or collect (validating) run drops the setting and says so. A built-in id
      // always fails.
      if (ignoreUnknownPluginIds && isPluginRuleId(id)) {
        ignored.push(id);
        continue;
      }
      throw new UnknownRuleError(
        where,
        id,
        rules.map((r) => r.id),
      );
    }
    checkOptions(where, rule, setting.options);
    if (setting.severity === "off") off.add(id);
    else options.set(rule.id, setting.options);
  }
  const active = rules.filter((r) => !off.has(r.id));
  return {
    rules: active,
    fixOrder: fixOrder.filter((r) => !off.has(r.id)),
    enabled: new Set(active.map((r) => r.id)),
    options,
    categories,
    sources,
    ignoredSettings: ignored,
  };
};

export const BUILTIN: Registry = buildRegistry({ rules: RULES, fixOrder: FIX_ORDER, categories: BUILTIN_CATEGORIES });
