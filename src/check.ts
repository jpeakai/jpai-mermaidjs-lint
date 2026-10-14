// Checking: build the model once, run every active rule over it, and sort the
// findings. Nothing is modified in check mode and no rule reads another's
// result, so every rule is started at once and the engine waits for all of
// them. A rule may be synchronous or return a promise, so a rule that waits on
// a tool or a service overlaps with the others.

import { buildDocModel, type DocModel } from "./model.ts";
import { BUILTIN, HELPERS, type Registry } from "./rules/registry.ts";
import type { Finding, Rule, RuleOptions } from "./rules/types.ts";

// Run-level settings that win over a rule's own option for this run, as the
// flags give them.
export interface RunFlags {
  preset?: string;
  profile?: string;
}

// The options a rule runs with: its configured options, then a flag for any
// option the rule declares.
export const optionsFor = (rule: Rule, configured: RuleOptions | undefined, flags: RunFlags): RuleOptions => {
  const options: Record<string, unknown> = { ...configured };
  for (const name of ["preset", "profile"] as const) {
    const value = flags[name];
    if (value !== undefined && rule.options?.[name]) options[name] = value;
  }
  return options;
};

export const checkModel = async (
  doc: DocModel,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<Finding[]> => {
  const perRule = registry.rules.map((rule) =>
    rule.check({ doc, file, options: optionsFor(rule, registry.options.get(rule.id), flags), helpers: HELPERS }),
  );
  const findings = (await Promise.all(perRule)).flat();
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
};

export const checkMarkdown = (
  src: string,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<Finding[]> =>
  checkModel(buildDocModel(src, file.toLowerCase().endsWith(".mmd") ? "diagram" : "markdown"), file, flags, registry);
