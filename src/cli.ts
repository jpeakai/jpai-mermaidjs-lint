// The command line: check files, optionally fix them first. The process glue
// lives in bin.ts so tests can call main() directly.

import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { checkModel, type RunFlags } from "./check.ts";
import { FlagError, MermaidLintError, UsageError } from "./errors.ts";
import { collectFiles } from "./files.ts";
import { fixSourceReport } from "./fix/engine.ts";
import { buildDocModel } from "./model.ts";
import { PROFILES } from "./parse/contrast.ts";
import { canonicalPreset, PRESET_NAMES } from "./parse/metrics.ts";
import type { PluginFailure } from "./plugins/index.ts";
import { setUp } from "./project.ts";
import { RULES } from "./rules/index.ts";
import type { LoadedSource, Registry } from "./rules/registry.ts";
import { CATEGORIES } from "./rules/types.ts";

const USAGE = `usage: mermaidjs-lint <path...> [--fix] [--json] [--preset NAME] [--profile NAME] [--config FILE]
                     [--no-plugins | --lenient-plugins]
       mermaidjs-lint --list-rules
       mermaidjs-lint --validate-plugins [--json] [--config FILE]
       mermaidjs-lint --version | -h, --help

Deterministic Mermaid diagram gates (* = autofixable):
${CATEGORIES.map((c) =>
  [`  ${c}:`, ...RULES.filter((r) => r.category === c).map((r) => `    ${r.id}${r.fix ? "*" : " "} ${r.summary}`)].join(
    "\n",
  ),
).join("\n")}

A path is a .mmd file, a markdown file whose mermaid fences are checked, or a
directory, which is walked for both.
Examples of every rule, with fixes: https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/

-p, --preset NAME sets the density for every complexity rule: ${PRESET_NAMES.join(", ")}
  (aliases low, medium, high). Rule options and the config can set it per rule.
--profile NAME sets how contrast is read: ${PROFILES.join(", ")}.
  auto reads mkdocs-material when any parent folder holds mkdocs.yml or mkdocs.yaml, else github.
--fix applies every fix it can prove safe, then reports what remains.
A fixer that is unsure leaves the text alone and the finding stays.
--config FILE reads that config instead of mermaidjs-lint.config.json or .mjs at the project root.
Plugins load on their own from .mermaidjs-lint/rules and from dependencies named mermaidjs-lint-plugin-*.
--no-plugins runs the built-in rules only, for a baseline or a repo you do not trust.
--lenient-plugins skips a plugin that fails to load and says so, instead of stopping the run.
--validate-plugins loads and checks every plugin, reports every failure, and runs no check or fix.
--list-rules prints every active rule by category, including plugin rules, and where each plugin came from.
--version prints the version, to quote in a bug report.
Exits 1 when findings remain or a plugin fails to load, 2 on usage error.`;

interface Parsed {
  values: {
    fix?: boolean;
    json?: boolean;
    help?: boolean;
    preset?: string;
    profile?: string;
    config?: string;
    "no-plugins"?: boolean;
    "lenient-plugins"?: boolean;
    "validate-plugins"?: boolean;
    "list-rules"?: boolean;
    version?: boolean;
  };
  positionals: string[];
}

const parse = (argv: string[]): Parsed =>
  parseArgs({
    args: argv,
    options: {
      fix: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      preset: { type: "string", short: "p" },
      profile: { type: "string" },
      config: { type: "string" },
      "no-plugins": { type: "boolean", default: false },
      "lenient-plugins": { type: "boolean", default: false },
      "validate-plugins": { type: "boolean", default: false },
      "list-rules": { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

const namesOf = (sources: LoadedSource[]): string =>
  sources.map((s) => `${s.namespace} (${plural(s.rules.length, "rule")})`).join(", ");

// The one line every run prints about third-party code, because loading it is
// automatic. It says what ran, or what was skipped, and prints nothing when the
// project has no plugins.
export const loadedLine = (sources: LoadedSource[], skipped: string[]): string | null => {
  if (skipped.length > 0) return `mermaidjs-lint: plugins off; skipped ${skipped.join(", ")}`;
  if (sources.length === 0) return null;
  return `mermaidjs-lint: loaded ${namesOf(sources)}`;
};

const reasonOf = (f: PluginFailure): string => f.error.message.replace(`plugin ${f.source}: `, "");

// One line for each plugin a lenient run left out, with the named reason, and
// one for each config setting dropped because its plugin did not load.
export const skippedLines = (failures: PluginFailure[], ignored: string[]): string[] => [
  ...failures.map((f) => `mermaidjs-lint: skipped plugin ${f.source} [${f.error.code}]: ${reasonOf(f)}`),
  ...ignored.map((id) => `mermaidjs-lint: ignored config setting for ${id}, whose plugin did not load`),
];

// Every active rule under its category, then where each plugin came from.
export const listRules = (registry: Registry): string => {
  const lines: string[] = [];
  for (const [category, description] of registry.categories) {
    const rules = registry.rules.filter((r) => r.category === category);
    if (rules.length === 0) continue;
    lines.push(`${category}: ${description}`);
    for (const r of rules) lines.push(`  ${r.id}${r.fix ? "*" : " "} ${r.summary}`);
  }
  if (registry.sources.length > 0) {
    lines.push("", "plugins:");
    for (const s of registry.sources) lines.push(`  ${s.namespace} (${s.kind}) ${s.spec}`);
  }
  return lines.join("\n");
};

const validate = (
  registry: Registry,
  failures: PluginFailure[],
  json: boolean,
): { code: number; stdout: string | null; stderr: string[] } => {
  const sources = registry.sources.map((s) => ({ ...s }));
  const failed = failures.map((f) => ({ source: f.source, kind: f.kind, code: f.error.code, message: reasonOf(f) }));
  const code = failures.length > 0 ? 1 : 0;
  if (json) {
    return {
      code,
      stdout: JSON.stringify({ valid: code === 0, plugins: sources, failures: failed }, null, 2),
      stderr: [],
    };
  }
  if (failures.length > 0) {
    const total = failures.length + sources.length;
    return {
      code,
      stdout: null,
      stderr: [
        `mermaidjs-lint: plugin validation failed, ${failures.length} of ${plural(total, "source")}`,
        ...failed.map((f) => `  [${f.code}] ${f.source}: ${f.message}`),
      ],
    };
  }
  const line =
    sources.length === 0
      ? "mermaidjs-lint: no plugins found"
      : `mermaidjs-lint: plugins valid: ${namesOf(registry.sources)}`;
  return { code, stdout: line, stderr: [] };
};

const display = (file: string, cwd: string): string => {
  const rel = relative(cwd, file);
  return !rel || rel.startsWith("..") ? file : rel;
};

const run = async (argv: string[], cwd: string): Promise<number> => {
  let parsed: Parsed;
  try {
    parsed = parse(argv);
  } catch (err) {
    throw new FlagError("argv", err instanceof Error ? err.message : String(err));
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.version) {
    console.log(pkg.version);
    return 0;
  }
  const listing = values["list-rules"];
  const validating = values["validate-plugins"];
  if (values.preset !== undefined && canonicalPreset(values.preset) === null) {
    throw new FlagError("--preset", `--preset must be one of ${PRESET_NAMES.join(", ")}, not "${values.preset}"`);
  }
  if (values.profile !== undefined && !PROFILES.includes(values.profile as (typeof PROFILES)[number])) {
    throw new FlagError("--profile", `--profile must be one of ${PROFILES.join(", ")}, not "${values.profile}"`);
  }
  if (values["no-plugins"] && values["lenient-plugins"]) {
    throw new FlagError("--lenient-plugins", "--no-plugins and --lenient-plugins contradict each other");
  }
  if (validating && (values["no-plugins"] || values.fix || listing)) {
    throw new FlagError("--validate-plugins", "--validate-plugins takes no --no-plugins, --fix or --list-rules");
  }
  if (validating && positionals.length > 0) {
    throw new FlagError("files", "--validate-plugins runs no check, so it takes no files");
  }
  if (positionals.length === 0 && !listing && !validating) throw new FlagError("files", "no files given");

  const { registry, skipped, failures } = await setUp({
    cwd,
    configPath: values.config,
    noPlugins: values["no-plugins"],
    lenient: values["lenient-plugins"],
    collect: validating,
  });

  if (validating) {
    const result = validate(registry, failures, Boolean(values.json));
    for (const line of result.stderr) console.error(line);
    if (result.stdout) console.log(result.stdout);
    return result.code;
  }

  const note = loadedLine(registry.sources, skipped);
  if (note) console.error(note);
  for (const line of skippedLines(failures, registry.ignoredSettings)) console.error(line);
  if (listing) {
    console.log(listRules(registry));
    return 0;
  }

  const { files, unreadable } = collectFiles(positionals.map((p) => (p.startsWith("/") ? p : `${cwd}/${p}`)));
  if (unreadable.length > 0) throw new FlagError("files", `cannot read ${unreadable.join(", ")}`);
  if (files.length === 0) throw new FlagError("files", "no matching files");

  const flags: RunFlags = { preset: values.preset, profile: values.profile };
  const perFile = await Promise.all(
    files.map(async (file) => {
      let src = await readFile(file, "utf8");
      if (values.fix) {
        const fixed = (await fixSourceReport(src, file, flags, registry)).output;
        if (fixed !== src) {
          await writeFile(file, fixed);
          src = fixed;
        }
      }
      const kind = file.toLowerCase().endsWith(".mmd") ? "diagram" : "markdown";
      const found = await checkModel(buildDocModel(src, kind), display(file, cwd), flags, registry);
      return found;
    }),
  );
  const all = perFile.flat();

  if (values.json) {
    const skippedPlugins = failures.map((f) => ({
      source: f.source,
      kind: f.kind,
      code: f.error.code,
      message: reasonOf(f),
    }));
    console.log(
      JSON.stringify({ findings: all, files: files.length, plugins: registry.sources, skippedPlugins }, null, 2),
    );
  } else {
    for (const f of all) {
      const where = f.endLine > f.line ? `${f.line}-${f.endLine}` : `${f.line}`;
      console.log(`${f.file}:${where} ${f.rule} ${f.message}`);
    }
    console.log(`${all.length} finding(s) in ${files.length} file(s)`);
  }
  return all.length > 0 ? 1 : 0;
};

// The line printed for a failure: its stable code, then the reason.
export const describeError = (err: unknown): string =>
  err instanceof MermaidLintError
    ? `error[${err.code}]: ${err.message}`
    : `error: ${err instanceof Error ? err.message : String(err)}`;

// A usage error prints its reason and the usage, and exits 2. Anything else is
// a runtime failure and propagates to bin.ts, which exits 1.
export const main = async (argv: string[] = process.argv.slice(2), cwd: string = process.cwd()): Promise<number> => {
  try {
    return await run(argv, cwd);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(describeError(err));
    console.error(USAGE);
    return 2;
  }
};
