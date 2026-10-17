// Discovery: which plugin sources a project has. Three places, in this order:
// local rule files in .mermaidjs-lint/rules, packages the project declares as
// dependencies and whose name matches the plugin pattern, and the paths or
// names a config lists. A directory of node_modules is never scanned, so only
// what the project chose to depend on can run.
//
// A declared package that is not installed, or whose package.json is not a
// JSON object, is a failure the caller decides how to treat, not an exception,
// so a lenient run can skip it and a validating run can report every one. A
// malformed project package.json throws PackageJsonError, except in a run with
// plugins off, which loads no package it names.

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { Config } from "../config.ts";
import { PackageJsonError, PluginLoadError, PluginNotInstalledError, PluginSourceError } from "../errors.ts";

export type SourceKind = "local" | "package" | "config";

export interface PluginSource {
  kind: SourceKind;
  // What the user would recognise: a package name or a path under the root.
  spec: string;
  // The file to import.
  path: string;
}

export interface UnresolvedSource {
  kind: SourceKind;
  error: PluginLoadError;
}

export interface Discovery {
  sources: PluginSource[];
  // Sources found but not resolvable, such as a declared package that is not
  // installed, each with the kind of source that named it.
  failures: UnresolvedSource[];
}

export const LOCAL_RULES = join(".mermaidjs-lint", "rules");

// mermaidjs-lint-plugin-acme, @acme/mermaidjs-lint-plugin-acme or @acme/mermaidjs-lint-plugin.
export const PACKAGE_PATTERN = /^(@[a-z0-9][a-z0-9._-]*\/)?mermaidjs-lint-plugin(-[a-z0-9-]+)?$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const readJson = async (path: string): Promise<Record<string, unknown> | null> => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (isRecord(value)) return value;
  } catch {
    // Reported below with the path.
  }
  throw new PackageJsonError(path);
};

// Every extension a local rule may have. Whether the runtime can import a
// TypeScript one is decided at load, so the reason is a named error.
const LOCAL_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".mts", ".cts"]);

const localSources = async (root: string): Promise<PluginSource[]> => {
  const dir = join(root, LOCAL_RULES);
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch {
    return [];
  }
  return names
    .filter((name) => LOCAL_EXTENSIONS.has(extname(name)) && !name.endsWith(".d.ts") && !name.endsWith(".d.mts"))
    .map((name) => ({ kind: "local", spec: join(LOCAL_RULES, name), path: join(dir, name) }));
};

// An approximation of Node resolution, read from a package's package.json:
// exports "." by node, import, default priority, then main, then index.js.
const CONDITIONS = ["node", "import", "default"];

// The first candidate that resolves to a target, in order.
const pickFirst = (candidates: unknown[]): string | null => {
  for (const item of candidates) {
    const found = pick(item);
    if (found) return found;
  }
  return null;
};

const pick = (target: unknown): string | null => {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) return pickFirst(target);
  if (isRecord(target)) return pickFirst(CONDITIONS.filter((c) => c in target).map((c) => target[c]));
  return null;
};

const entryOf = (pkg: Record<string, unknown>): string => {
  const exported = pkg.exports;
  const hasMap = isRecord(exported) && Object.keys(exported).some((k) => k.startsWith("."));
  const main = isRecord(exported) && "." in exported ? exported["."] : hasMap ? null : exported;
  return pick(main) ?? (typeof pkg.main === "string" ? pkg.main : "index.js");
};

export const resolvePackage = async (root: string, name: string): Promise<string> => {
  for (let dir = resolve(root); ; dir = dirname(dir)) {
    const folder = join(dir, "node_modules", name);
    let pkg: Record<string, unknown> | null;
    try {
      pkg = await readJson(join(folder, "package.json"));
    } catch (err) {
      if (!(err instanceof PackageJsonError)) throw err;
      throw new PluginSourceError(name, `its package.json at ${err.file} is not a JSON object`);
    }
    if (pkg) return join(folder, entryOf(pkg));
    if (dirname(dir) === dir) break;
  }
  throw new PluginNotInstalledError(name, root);
};

const declaredPlugins = async (root: string, tolerateBadManifest: boolean): Promise<string[]> => {
  let pkg: Record<string, unknown> | null;
  try {
    pkg = await readJson(join(root, "package.json"));
  } catch (err) {
    if (tolerateBadManifest && err instanceof PackageJsonError) return [];
    throw err;
  }
  if (!pkg) return [];
  const names = ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) => {
    const deps = pkg[field];
    return isRecord(deps) ? Object.keys(deps) : [];
  });
  return [...new Set(names)].filter((name) => PACKAGE_PATTERN.test(name)).sort();
};

// A run with plugins off loads nothing, so a malformed project package.json,
// which could only name packages that run will not load, does not stop it.
export const discoverSources = async (root: string, config: Config, pluginsOff = false): Promise<Discovery> => {
  const sources = await localSources(root);
  const failures: UnresolvedSource[] = [];
  const add = async (kind: SourceKind, spec: string, resolveIt: () => Promise<string>): Promise<void> => {
    try {
      sources.push({ kind, spec, path: await resolveIt() });
    } catch (err) {
      if (!(err instanceof PluginLoadError)) throw err;
      failures.push({ kind, error: err });
    }
  };
  for (const name of await declaredPlugins(root, pluginsOff))
    await add("package", name, () => resolvePackage(root, name));
  for (const spec of config.plugins || []) {
    const path = spec.startsWith(".") || isAbsolute(spec);
    await add("config", spec, () => (path ? Promise.resolve(resolve(root, spec)) : resolvePackage(root, spec)));
  }
  // A package both declared and listed in the config loads once.
  const seen = new Set<string>();
  return { sources: sources.filter((s) => !seen.has(s.path) && seen.add(s.path)), failures };
};
