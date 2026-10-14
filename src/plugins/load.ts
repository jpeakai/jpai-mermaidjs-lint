// Loading: import a plugin module, check it has the shape the contract
// promises, and turn its rules into ordinary Rules. Every failure is a named
// PluginLoadError that says which source and why. These functions never skip
// anything themselves: they return or throw, and the caller decides whether a
// failed source stops the run (strict) or is reported and left out (lenient).

import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PluginConflictError,
  PluginContractError,
  PluginFixerError,
  PluginImportError,
  PluginLoadError,
  PluginSourceError,
} from "../errors.ts";
import { BUILTIN_CATEGORIES } from "../rules/registry.ts";
import type { Edit, Finding, OptionType, Rule, RuleId } from "../rules/types.ts";
import { API_VERSION, CATEGORY_WORD, NAMESPACE, type Plugin, type PluginRule, RULE_KEY } from "./contract.ts";
import type { PluginSource } from "./discover.ts";
import { canImportTypeScript, type RuntimeInfo, TYPESCRIPT_HELP } from "./runtime.ts";

export { PluginLoadError };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// TypeScript is imported as is, so it needs a runtime that can. CommonJS
// TypeScript is never supported, because the loader imports modules.
const checkRuntime = (source: PluginSource, runtime?: RuntimeInfo): void => {
  const ext = extname(source.path);
  if (ext === ".cts") {
    throw new PluginSourceError(source.spec, "a local rule is an ES module, so use .ts or .mts, not .cts");
  }
  if ((ext === ".ts" || ext === ".mts") && !canImportTypeScript(runtime)) {
    throw new PluginSourceError(source.spec, TYPESCRIPT_HELP);
  }
};

const importModule = async (source: PluginSource, runtime?: RuntimeInfo): Promise<Record<string, unknown>> => {
  checkRuntime(source, runtime);
  try {
    return (await import(pathToFileURL(source.path).href)) as Record<string, unknown>;
  } catch (err) {
    throw new PluginImportError(source.spec, message(err));
  }
};

const OPTION_TYPES = new Set<OptionType>(["number", "string", "boolean", "string[]"]);

// Checks one rule's declaration and returns it, so a bad rule fails at load
// rather than the first time it runs.
const checkRule = (spec: string, key: string, raw: unknown, own: ReadonlySet<string>): PluginRule => {
  const where = `rule "${key}"`;
  if (!isRecord(raw)) throw new PluginContractError(spec, `${where} must be an object`);
  if (!RULE_KEY.test(key)) {
    throw new PluginContractError(spec, `${where} is not a valid key; use lower-case words joined by hyphens`);
  }
  const { category, summary, options, check, fix } = raw;
  if (typeof category !== "string" || !CATEGORY_WORD.test(category)) {
    throw new PluginContractError(spec, `${where} needs a category of one lower-case word`);
  }
  if (!BUILTIN_CATEGORIES.has(category) && !own.has(category)) {
    throw new PluginContractError(
      spec,
      `${where} uses the category "${category}", which this plugin does not declare in meta.categories`,
    );
  }
  if (!key.startsWith(`${category}-`)) {
    throw new PluginContractError(spec, `${where} must start with its category, as "${category}-short-name"`);
  }
  if (typeof summary !== "string" || summary === "") throw new PluginContractError(spec, `${where} needs a summary`);
  if (typeof check !== "function") throw new PluginContractError(spec, `${where} needs a check function`);
  if (fix !== undefined && typeof fix !== "function") {
    throw new PluginContractError(spec, `${where} fix must be a function`);
  }
  if (options !== undefined) {
    const valid = isRecord(options) && Object.values(options).every((t) => OPTION_TYPES.has(t as OptionType));
    if (!valid) {
      throw new PluginContractError(spec, `${where} options must map names to number, string, boolean or string[]`);
    }
  }
  return raw as unknown as PluginRule;
};

const checkCategories = (spec: string, raw: unknown): Record<string, string> => {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new PluginContractError(spec, "categories must map a word to a description");
  for (const [word, description] of Object.entries(raw)) {
    if (!CATEGORY_WORD.test(word)) throw new PluginContractError(spec, `category "${word}" is not one lower-case word`);
    if (BUILTIN_CATEGORIES.has(word)) {
      throw new PluginContractError(spec, `category "${word}" is built in and cannot be declared`);
    }
    if (typeof description !== "string" || description === "") {
      throw new PluginContractError(spec, `category "${word}" needs a one-line description`);
    }
  }
  return raw as Record<string, string>;
};

// A plugin object is checked here, apart from how it was imported, so a test
// can hold the same plugin to the same contract the loader does.
export const parsePlugin = (spec: string, raw: unknown, reserved: ReadonlySet<string>): Plugin => {
  if (!isRecord(raw) || !isRecord(raw.meta) || !isRecord(raw.rules)) {
    throw new PluginContractError(spec, "the default export must be { meta, rules }");
  }
  const { name, namespace, apiVersion } = raw.meta;
  if (apiVersion !== API_VERSION) {
    throw new PluginContractError(
      spec,
      `targets plugin apiVersion ${JSON.stringify(apiVersion)}, but this mermaidjs-lint supports ${API_VERSION}`,
    );
  }
  if (typeof name !== "string" || name === "") throw new PluginContractError(spec, "meta.name is required");
  if (typeof namespace !== "string" || !NAMESPACE.test(namespace)) {
    throw new PluginContractError(spec, "meta.namespace must be lower-case words joined by hyphens");
  }
  if (reserved.has(namespace)) throw new PluginContractError(spec, `meta.namespace "${namespace}" is reserved`);
  const categories = checkCategories(spec, raw.meta.categories);
  const own = new Set(Object.keys(categories));
  const rules = Object.fromEntries(
    Object.entries(raw.rules).map(([key, rule]) => [key, checkRule(spec, key, rule, own)]),
  );
  return { meta: { name, namespace, apiVersion, categories }, rules };
};

// A package: the default export is a Plugin.
export const loadPackage = async (source: PluginSource, reserved: ReadonlySet<string>): Promise<Plugin> =>
  parsePlugin(source.spec, (await importModule(source)).default, reserved);

export interface LocalLoad {
  // The local files that loaded, as one plugin. Null when none did.
  plugin: Plugin | null;
  failures: PluginLoadError[];
}

// Local files: each default-exports one rule, keyed by its file name. They load
// as one plugin under the fixed namespace `local`, and a file may export
// `categories` to declare the word its rule uses. Each file fails on its own,
// so one bad file does not hide the others, and the caller gets every failure.
export const loadLocal = async (sources: PluginSource[], runtime?: RuntimeInfo): Promise<LocalLoad> => {
  const failures: PluginLoadError[] = [];
  const fail = (err: unknown): void => {
    if (!(err instanceof PluginLoadError)) throw err;
    failures.push(err);
  };
  const categories: Record<string, string> = {};
  const owner: Record<string, string> = {};
  const loaded: { key: string; source: PluginSource; raw: unknown }[] = [];
  for (const source of sources) {
    try {
      const mod = await importModule(source, runtime);
      if (mod.default === undefined) {
        throw new PluginContractError(source.spec, "has no default export; export one rule");
      }
      const declared = checkCategories(source.spec, mod.categories);
      for (const [word, description] of Object.entries(declared)) {
        if (categories[word] !== undefined && categories[word] !== description) {
          throw new PluginConflictError(
            source.spec,
            owner[word] as string,
            `declares category "${word}" with a different description than another local file`,
          );
        }
        categories[word] = description;
        owner[word] = source.spec;
      }
      loaded.push({ key: basename(source.path, extname(source.path)), source, raw: mod.default });
    } catch (err) {
      fail(err);
    }
  }
  const own = new Set(Object.keys(categories));
  const rules: Record<string, PluginRule> = {};
  for (const { key, source, raw } of loaded) {
    try {
      rules[key] = checkRule(source.spec, key, raw, own);
    } catch (err) {
      fail(err);
    }
  }
  const plugin: Plugin | null =
    Object.keys(rules).length === 0 && failures.length > 0
      ? null
      : { meta: { name: "local", namespace: "local", apiVersion: API_VERSION, categories }, rules };
  return { plugin, failures };
};

const validFinding = (f: unknown): f is { line: number; endLine?: number; message: string; remediation?: string } =>
  isRecord(f) &&
  Number.isInteger(f.line) &&
  (f.line as number) >= 1 &&
  typeof f.message === "string" &&
  (f.endLine === undefined || (Number.isInteger(f.endLine) && (f.endLine as number) >= (f.line as number))) &&
  (f.remediation === undefined || typeof f.remediation === "string");

const EXPECTATIONS = new Set(["same-diagrams", "same-tree"]);

// A plugin rule becomes a Rule whose id is namespace/key. The plugin function may
// be synchronous or return a promise, and the wrapper awaits it. Its check cannot
// take the run down: a throw, a rejection or a malformed finding becomes a finding for that
// rule, and the other rules carry on. Its fixer is held to the same proof as a
// built-in, so a fixer that throws or returns nonsense stops the run loudly.
export const toRule = (namespace: string, key: string, rule: PluginRule): Rule => {
  const id = `${namespace}/${key}` as RuleId;
  const check: Rule["check"] = async (ctx) => {
    const report = (why: string): Finding[] => [
      { file: ctx.file, line: 1, endLine: 1, rule: id, message: `plugin rule ${why}` },
    ];
    let found: unknown;
    try {
      found = await rule.check(ctx);
    } catch (err) {
      return report(`threw: ${message(err)}`);
    }
    if (!Array.isArray(found) || !found.every(validFinding)) {
      return report("returned something other than a list of { line, message } findings");
    }
    return found.map((f) => ({
      file: ctx.file,
      line: f.line,
      endLine: f.endLine ?? f.line,
      rule: id,
      message: f.message,
      ...(f.remediation !== undefined && { remediation: f.remediation }),
    }));
  };
  const fix: Rule["fix"] = rule.fix
    ? async (ctx) => {
        let edits: unknown;
        try {
          edits = await rule.fix?.(ctx);
        } catch (err) {
          throw new PluginFixerError(id, `fixer threw: ${message(err)}`);
        }
        if (!Array.isArray(edits))
          throw new PluginFixerError(id, "fixer returned something other than a list of edits");
        return edits.map((e: Edit) => {
          if (!isRecord(e) || !isRecord(e.expect) || !EXPECTATIONS.has(e.expect.kind as string)) {
            throw new PluginFixerError(id, "fixer returned an edit with no valid expectation");
          }
          return { ...e, rule: id };
        });
      }
    : undefined;
  return { id, category: rule.category, summary: rule.summary, options: rule.options, check, ...(fix ? { fix } : {}) };
};
