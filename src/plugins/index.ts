// Assembling plugins: discover the sources, load each one, and merge their
// rules and categories into the set the registry is built from. Namespaces and
// new category words are global, so two plugins cannot share either.
//
// How a failed source is treated is the mode. Strict throws the first failure,
// which is the default. Lenient leaves the failed source out and returns it, so
// the caller can say so. Collect does the same and is what validation uses, so
// one run reports every failure. Off loads nothing.

import type { Config } from "../config.ts";
import { PluginConflictError, PluginLoadError } from "../errors.ts";
import { BUILTIN_CATEGORIES, type LoadedSource } from "../rules/registry.ts";
import type { Rule } from "../rules/types.ts";
import type { Plugin } from "./contract.ts";
import { discoverSources, LOCAL_RULES, type PluginSource, type SourceKind } from "./discover.ts";
import { loadLocal, loadPackage, toRule } from "./load.ts";

export type PluginMode = "off" | "strict" | "lenient" | "collect";

export interface PluginFailure {
  source: string;
  kind: SourceKind;
  error: PluginLoadError;
}

export interface PluginSet {
  rules: Rule[];
  categories: Map<string, string>;
  sources: LoadedSource[];
  // Specs found but not loaded, because the run asked for built-ins only.
  skipped: string[];
  // Sources left out because they failed. Always empty in strict mode, which throws.
  failures: PluginFailure[];
}

type Settle = (error: PluginLoadError, kind: SourceKind) => void;

interface LoadedPlugin {
  plugin: Plugin;
  kind: SourceKind;
  spec: string;
}

// Local files load as one plugin, then each package or config source on its own.
const loadAll = async (found: PluginSource[], settle: Settle): Promise<LoadedPlugin[]> => {
  const loaded: LoadedPlugin[] = [];
  const locals = found.filter((s) => s.kind === "local");
  if (locals.length > 0) {
    const local = await loadLocal(locals);
    for (const error of local.failures) settle(error, "local");
    if (local.plugin) loaded.push({ plugin: local.plugin, kind: "local", spec: LOCAL_RULES });
  }
  for (const source of found.filter((s) => s.kind !== "local")) {
    try {
      loaded.push({ plugin: await loadPackage(source, new Set(["local"])), kind: source.kind, spec: source.spec });
    } catch (err) {
      if (!(err instanceof PluginLoadError)) throw err;
      settle(err, source.kind);
    }
  }
  return loaded;
};

// Who already holds each namespace and each new category word.
interface Claims {
  namespaces: Map<string, string>;
  declaredBy: Map<string, string>;
}

// The reason a plugin cannot claim its namespace or categories, or null when
// it can.
const conflictOf = (plugin: Plugin, spec: string, claims: Claims): PluginConflictError | null => {
  const { namespace } = plugin.meta;
  const words = Object.keys(plugin.meta.categories ?? {});
  const taken = claims.namespaces.get(namespace);
  const clash = words.find((w) => claims.declaredBy.has(w));
  if (!(taken || clash)) return null;
  const other = (taken ?? claims.declaredBy.get(clash as string)) as string;
  const reason = taken
    ? `namespace "${namespace}" is already used by ${other}`
    : `category "${clash}" is already declared by ${other}`;
  return new PluginConflictError(spec, other, reason);
};

// Namespaces and new categories are global. The first plugin to claim one
// keeps it, and a later claimant fails, naming both.
const acceptClaims = (loaded: LoadedPlugin[], set: PluginSet, settle: Settle): LoadedPlugin[] => {
  const claims: Claims = { namespaces: new Map(), declaredBy: new Map() };
  const accepted: LoadedPlugin[] = [];
  for (const entry of loaded) {
    const { plugin, spec, kind } = entry;
    const conflict = conflictOf(plugin, spec, claims);
    if (conflict) {
      settle(conflict, kind);
      continue;
    }
    claims.namespaces.set(plugin.meta.namespace, spec);
    for (const [word, description] of Object.entries(plugin.meta.categories ?? {})) {
      claims.declaredBy.set(word, spec);
      set.categories.set(word, description);
    }
    accepted.push(entry);
  }
  return accepted;
};

export const loadPlugins = async (root: string, config: Config, mode: PluginMode): Promise<PluginSet> => {
  const { sources: found, failures: unresolved } = await discoverSources(root, config, mode === "off");
  const set: PluginSet = {
    rules: [],
    categories: new Map(BUILTIN_CATEGORIES),
    sources: [],
    skipped: [],
    failures: [],
  };
  if (mode === "off") {
    return { ...set, skipped: [...found.map((s) => s.spec), ...unresolved.map((u) => u.error.source)] };
  }

  // Strict stops at the first failure. The others record it and carry on.
  const settle: Settle = (error, kind) => {
    if (mode === "strict") throw error;
    if (!set.failures.some((f) => f.source === error.source)) set.failures.push({ source: error.source, kind, error });
  };
  for (const { error, kind } of unresolved) settle(error, kind);

  const accepted = acceptClaims(await loadAll(found, settle), set, settle);
  for (const { plugin, kind, spec } of accepted) {
    const rules = Object.entries(plugin.rules).map(([key, rule]) => toRule(plugin.meta.namespace, key, rule));
    set.rules.push(...rules);
    set.sources.push({ kind, spec, namespace: plugin.meta.namespace, rules: rules.map((r) => r.id) });
  }
  return set;
};
