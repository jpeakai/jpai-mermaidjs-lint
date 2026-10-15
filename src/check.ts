// Checking: build the model once, run every active rule over it, and sort the
// findings. Nothing is modified in check mode and no rule reads another's
// result, so every rule is started at once and the engine waits for all of
// them. A rule may be synchronous or return a promise, so a rule that waits on
// a tool or a service overlaps with the others.

import { FlagError } from "./errors.ts";
import { buildDocModel, type DocModel, documentKind } from "./model.ts";
import { type CanvasSetting, canvasColourProblem, PROFILES, THEMES, type Theme } from "./parse/contrast.ts";
import { canonicalPreset, PRESET_NAMES } from "./parse/metrics.ts";
import { BUILTIN, HELPERS, type Registry } from "./rules/registry.ts";
import type { Finding, Rule, RuleOptions } from "./rules/types.ts";

// Run-level settings that win over a rule's own option for this run, as the
// flags give them.
export interface RunFlags {
  preset?: string;
  profile?: string;
  // The page canvas under the github profile, either side or both. A side
  // left out keeps the configured canvas, or GitHub's.
  canvas?: CanvasSetting;
}

// The name a canvas side goes by: the command's flag, or the RunFlags field.
const canvasName = (side: Theme, prefix: string): string => (prefix ? `${prefix}canvas-${side}` : `canvas.${side}`);

// A preset, profile or canvas that no rule can take fails as a usage error,
// with the code the command gives a bad flag, so a library caller can branch on
// it. The command passes "--" as the prefix, so the message names its own flag.
export const checkRunFlags = (flags: RunFlags, prefix = ""): void => {
  const { preset, profile, canvas } = flags;
  for (const side of THEMES) {
    if (canvas?.[side] === undefined) continue;
    const problem = canvasColourProblem(canvas[side]);
    if (problem) {
      const name = canvasName(side, prefix);
      throw new FlagError(name, `${name} ${problem}: "${canvas[side]}"; give an opaque CSS colour, such as #ffffff`);
    }
  }
  const sides = THEMES.filter((side) => canvas?.[side] !== undefined);
  const first = sides[0];
  if (profile === "mkdocs-material" && first !== undefined) {
    const name = canvasName(first, prefix);
    throw new FlagError(
      name,
      `${name} applies under the github profile only; mkdocs-material scores Material's own page colours`,
    );
  }
  if (preset !== undefined && canonicalPreset(preset) === null) {
    throw new FlagError(
      `${prefix}preset`,
      `${prefix}preset must be one of ${PRESET_NAMES.join(", ")}, not "${preset}"`,
    );
  }
  if (profile !== undefined && !PROFILES.includes(profile as (typeof PROFILES)[number])) {
    throw new FlagError(`${prefix}profile`, `${prefix}profile must be one of ${PROFILES.join(", ")}, not "${profile}"`);
  }
};

// The options a rule runs with: its configured options, then a flag for any
// option the rule declares. A preset reaches the rule by its canonical name,
// so a plugin rule never has to resolve an alias such as `high` or `H`.
export const optionsFor = (rule: Rule, configured: RuleOptions | undefined, flags: RunFlags): RuleOptions => {
  const options: Record<string, unknown> = { ...configured };
  for (const name of ["preset", "profile"] as const) {
    const value = flags[name];
    if (value !== undefined && rule.options?.[name]) options[name] = value;
  }
  if (typeof options.preset === "string") options.preset = canonicalPreset(options.preset) ?? options.preset;
  // A canvas flag sets one side over the configured canvas, so --canvas-dark
  // alone keeps a configured light side.
  const canvas = flags.canvas;
  if (canvas && THEMES.some((side) => canvas[side] !== undefined) && rule.options?.canvas === "canvas") {
    const configured = typeof options.canvas === "object" && options.canvas !== null ? options.canvas : {};
    const merged: Record<string, string> = { ...(configured as Record<string, string>) };
    for (const side of THEMES) {
      const value = canvas[side];
      if (value !== undefined) merged[side] = value;
    }
    options.canvas = merged;
  }
  return options;
};

export const checkModel = async (
  doc: DocModel,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<Finding[]> => {
  checkRunFlags(flags);
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
): Promise<Finding[]> => checkModel(buildDocModel(src, documentKind(file)), file, flags, registry);
