// A test helper for plugin authors: run one plugin rule over real strings, with
// the same contract checks as the loader, the same context and the same
// verified fix engine as a real run. It skips the reserved `local` namespace
// and cross-plugin conflict checks. It is a separate entry point so a plugin's
// tests import it and production code never does.

import { checkMarkdown, type RunFlags } from "./check.ts";
import { type FixReport, fixSourceReport } from "./fix/engine.ts";
import type { Plugin, PluginRule } from "./plugins/contract.ts";
import { parsePlugin, toRule } from "./plugins/load.ts";
import { BUILTIN_CATEGORIES, buildRegistry, type Registry } from "./rules/registry.ts";
import type { Finding, RuleOptions } from "./rules/types.ts";

export interface RunOptions {
  // The rule's own options, as a config would give them.
  options?: RuleOptions;
  // The run flags, as --preset, --profile, --canvas-light and --canvas-dark
  // would give them.
  flags?: RunFlags;
  // The file name, which decides markdown or a standalone diagram. Default test.md.
  file?: string;
}

// Wraps a local rule module, with its optional `categories` export, as the
// plugin the loader would build from the file under the `local` namespace.
export const localPlugin = (key: string, mod: { default: PluginRule; categories?: Record<string, string> }): Plugin =>
  parsePlugin(
    "local",
    {
      meta: { name: "local", namespace: "local", apiVersion: 1, categories: mod.categories },
      rules: { [key]: mod.default },
    },
    new Set(),
  );

const registryFor = (plugin: Plugin, key: string, options: RuleOptions): Registry => {
  const checked = parsePlugin(plugin.meta.name, plugin, new Set());
  const rule = checked.rules[key];
  if (!rule) {
    throw new Error(
      `plugin "${plugin.meta.name}" has no rule "${key}"; it has ${Object.keys(checked.rules).join(", ")}`,
    );
  }
  const built = toRule(checked.meta.namespace, key, rule);
  return buildRegistry({
    rules: [built],
    fixOrder: built.fix ? [built] : [],
    categories: new Map([...BUILTIN_CATEGORIES, ...Object.entries(checked.meta.categories ?? {})]),
    config: {
      plugins: [],
      pluginLoading: "strict",
      file: null,
      rules: new Map([[built.id, { severity: "error", options }]]),
    },
  });
};

// The findings one rule of the plugin reports for a document.
export const checkRule = (plugin: Plugin, key: string, src: string, run: RunOptions = {}): Promise<Finding[]> =>
  checkMarkdown(src, run.file ?? "test.md", run.flags, registryFor(plugin, key, run.options ?? {}));

// The document after the rule's fixer has run to a fixpoint, and what was
// applied or refused.
export const fixRule = (plugin: Plugin, key: string, src: string, run: RunOptions = {}): Promise<FixReport> =>
  fixSourceReport(src, run.file ?? "test.md", run.flags, registryFor(plugin, key, run.options ?? {}));
