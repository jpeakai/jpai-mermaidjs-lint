// The config file: which rules are off, what options each takes, and how
// strictly plugins load. It is optional, because everything auto-detected loads
// without it. A mistake in it is a named usage error, so a stale or misspelt
// rule id fails the run instead of silently doing nothing.

import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { AmbiguousConfigError, ConfigFileError, ConfigShapeError, RuleSettingError, UsageError } from "./errors.ts";
import type { RuleOptions } from "./rules/types.ts";

export { UsageError };

export type Severity = "error" | "off";

// How a plugin that fails to load is treated. Strict stops the run. Lenient
// skips that plugin, says so, and carries on with the rest.
export type PluginLoading = "strict" | "lenient";

export interface RuleSetting {
  severity: Severity;
  options: RuleOptions;
}

export interface Config {
  // Extra plugin paths or package names beyond what is auto-detected, or
  // `false` for a built-ins-only run.
  plugins: string[] | false;
  pluginLoading: PluginLoading;
  rules: Map<string, RuleSetting>;
  // The file it came from, for messages. Null when there is no config.
  file: string | null;
}

export const NO_CONFIG: Config = { plugins: [], pluginLoading: "strict", rules: new Map(), file: null };

export const CONFIG_FILES = ["mermaidjs-lint.config.json", "mermaidjs-lint.config.mjs"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const parseSetting = (file: string, id: string, raw: unknown): RuleSetting => {
  const [severity, options = {}] = Array.isArray(raw) ? raw : [raw];
  if (Array.isArray(raw) && (raw.length < 1 || raw.length > 2)) {
    throw new RuleSettingError(file, id, 'must be "error", "off" or [severity, options]');
  }
  if (severity !== "error" && severity !== "off") {
    throw new RuleSettingError(file, id, `has severity ${JSON.stringify(severity)}; use "error" or "off"`);
  }
  if (!isRecord(options)) throw new RuleSettingError(file, id, "options must be an object");
  return { severity, options };
};

export const parseConfig = (file: string, raw: unknown): Config => {
  if (!isRecord(raw)) throw new ConfigShapeError(file, "the config must be an object");
  for (const key of Object.keys(raw)) {
    if (key !== "plugins" && key !== "pluginLoading" && key !== "rules") {
      throw new ConfigShapeError(
        file,
        `unknown key "${key}"; a config has "plugins", "pluginLoading" and "rules"`,
        key,
      );
    }
  }
  const { plugins = [], pluginLoading = "strict", rules = {} } = raw;
  const validPlugins = plugins === false || (Array.isArray(plugins) && plugins.every((p) => typeof p === "string"));
  if (!validPlugins) throw new ConfigShapeError(file, '"plugins" must be a list of strings, or false', "plugins");
  if (pluginLoading !== "strict" && pluginLoading !== "lenient") {
    throw new ConfigShapeError(file, '"pluginLoading" must be "strict" or "lenient"', "pluginLoading");
  }
  if (!isRecord(rules)) throw new ConfigShapeError(file, '"rules" must be an object', "rules");
  return {
    plugins: plugins as string[] | false,
    pluginLoading,
    rules: new Map(Object.entries(rules).map(([id, value]) => [id, parseSetting(file, id, value)])),
    file,
  };
};

// The first config file at the root, or null. Two at once is ambiguous, so it
// is an error rather than a pick.
export const findConfig = async (root: string): Promise<string | null> => {
  const found: string[] = [];
  for (const name of CONFIG_FILES) {
    const path = join(root, name);
    if (
      await access(path).then(
        () => true,
        () => false,
      )
    )
      found.push(path);
  }
  if (found.length > 1) throw new AmbiguousConfigError(root, found);
  return found[0] ?? null;
};

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const loadConfig = async (file: string): Promise<Config> => {
  if (extname(file) === ".json") {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      throw new ConfigFileError(file, reason(err));
    }
    return parseConfig(file, raw);
  }
  if (extname(file) === ".mjs") {
    let mod: { default?: unknown };
    try {
      mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
    } catch (err) {
      throw new ConfigFileError(file, `could not be imported: ${reason(err)}`);
    }
    return parseConfig(file, mod.default);
  }
  throw new ConfigFileError(file, "a config is a .json or .mjs file");
};
