// Discovery: which plugin sources a project has. Three places, in this order:
// local rule files in .mermaidjs-lint/rules, packages the project declares as
// dependencies and whose name matches the plugin pattern, and the paths or
// names a config lists. A directory of node_modules is never scanned, so only
// what the project chose to depend on can run.
//
// A source that cannot be resolved is a failure the caller decides how to
// treat, not an exception, so a lenient run can skip it and a validating run
// can report every one.

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { Config } from "../config.ts";
import { PluginNotInstalledError } from "../errors.ts";

export type SourceKind = "local" | "package" | "config";

export interface PluginSource {
  kind: SourceKind;
  // What the user would recognise: a package name or a path under the root.
  spec: string;
  // The file to import.
  path: string;
}

export interface Discovery {
  sources: PluginSource[];
  // Sources found but not resolvable, such as a declared package that is not installed.
  failures: PluginNotInstalledError[];
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
  throw new Error(`${path} is not a JSON object`);
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

// The file Node would import for a package, read from its package.json the
// way a resolver does: the exports entry, then main, then index.js.
const pick = (target: unknown): string | null => {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const item of target) {
      const found = pick(item);
      if (found) return found;
    }
    return null;
  }
  if (isRecord(target)) {
    for (const condition of ["node", "import", "default"]) {
      if (condition in target) {
        const found = pick(target[condition]);
        if (found) return found;
      }
    }
  }
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
    const pkg = await readJson(join(folder, "package.json"));
    if (pkg) return join(folder, entryOf(pkg));
    if (dirname(dir) === dir) break;
  }
  throw new PluginNotInstalledError(name, root);
};

const declaredPlugins = async (root: string): Promise<string[]> => {
  const pkg = await readJson(join(root, "package.json"));
  if (!pkg) return [];
  const names = ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) => {
    const deps = pkg[field];
    return isRecord(deps) ? Object.keys(deps) : [];
  });
  return [...new Set(names)].filter((name) => PACKAGE_PATTERN.test(name)).sort();
};

export const discoverSources = async (root: string, config: Config): Promise<Discovery> => {
  const sources = await localSources(root);
  const failures: PluginNotInstalledError[] = [];
  const add = async (kind: SourceKind, spec: string, resolveIt: () => Promise<string>): Promise<void> => {
    try {
      sources.push({ kind, spec, path: await resolveIt() });
    } catch (err) {
      if (!(err instanceof PluginNotInstalledError)) throw err;
      failures.push(err);
    }
  };
  for (const name of await declaredPlugins(root)) await add("package", name, () => resolvePackage(root, name));
  for (const spec of config.plugins || []) {
    const path = spec.startsWith(".") || isAbsolute(spec);
    await add("config", spec, () => (path ? Promise.resolve(resolve(root, spec)) : resolvePackage(root, spec)));
  }
  // A package both declared and listed in the config loads once.
  const seen = new Set<string>();
  return { sources: sources.filter((s) => !seen.has(s.path) && seen.add(s.path)), failures };
};
