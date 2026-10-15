// Setting up a run: find the project root, read its config, load the plugins,
// and build the registry every check and fix in the run uses. This happens
// once, before any file is read, so a bad config or plugin stops the run
// before it touches a document.

import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CONFIG_FILES, findConfig, loadConfig, NO_CONFIG } from "./config.ts";
import { ConfigNotFoundError } from "./errors.ts";
import { loadPlugins, type PluginFailure, type PluginMode } from "./plugins/index.ts";
import { FIX_ORDER, RULES } from "./rules/index.ts";
import { buildRegistry, type Registry } from "./rules/registry.ts";

export const LOCAL_DIR = ".mermaidjs-lint";

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

// The nearest ancestor of the working directory that marks a project: a
// package.json, a config file or a .mermaidjs-lint directory. With none, the
// working directory itself, so a loose folder of notes still works.
export const findProjectRoot = async (cwd: string): Promise<string> => {
  const markers = ["package.json", LOCAL_DIR, ...CONFIG_FILES];
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    for (const marker of markers) if (await exists(join(dir, marker))) return dir;
    if (dirname(dir) === dir) return resolve(cwd);
  }
};

export interface SetupOptions {
  cwd: string;
  configPath?: string;
  // Built-ins only. Anything discovered is reported as skipped.
  noPlugins?: boolean;
  // Skip a plugin that fails to load and say so, instead of stopping the run.
  lenient?: boolean;
  // Load every plugin and report every failure, without stopping at the first.
  collect?: boolean;
}

export interface Setup {
  registry: Registry;
  skipped: string[];
  // Plugins left out because they failed. Empty unless the run was lenient or collecting.
  failures: PluginFailure[];
}

export const setUp = async ({
  cwd,
  configPath,
  noPlugins = false,
  lenient = false,
  collect = false,
}: SetupOptions): Promise<Setup> => {
  const root = await findProjectRoot(cwd);
  let file: string | null;
  if (configPath !== undefined) {
    file = resolve(cwd, configPath);
    if (!(await exists(file))) throw new ConfigNotFoundError(configPath);
  } else {
    file = await findConfig(root);
  }
  const config = file ? await loadConfig(file) : NO_CONFIG;
  let mode: PluginMode = "strict";
  if (noPlugins || config.plugins === false) mode = "off";
  else if (collect) mode = "collect";
  else if (lenient || config.pluginLoading === "lenient") mode = "lenient";
  const plugins = await loadPlugins(root, config, mode);
  const registry = buildRegistry({
    rules: [...RULES, ...plugins.rules],
    fixOrder: [...FIX_ORDER, ...plugins.rules.filter((r) => r.fix)],
    categories: plugins.categories,
    sources: plugins.sources,
    config,
    // A plugin rule's setting names a rule that is not loaded in these modes,
    // by choice (off) or by failure (lenient, collect), so it is set aside
    // rather than failing the run. A built-in id never is.
    ignoreUnknownPluginIds: mode !== "strict",
  });
  return { registry, skipped: plugins.skipped, failures: plugins.failures };
};
