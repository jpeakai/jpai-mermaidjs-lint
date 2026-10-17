// The command line: check files, optionally fix them first. The process glue
// lives in bin.ts so tests can call main() directly.

import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { canvasSetAside, checkModel, checkRunFlags, type RunFlags } from "./check.ts";
import { FixOutsideRootError, FlagError, MermaidLintError, UsageError } from "./errors.ts";
import { collectFiles, DIAGRAM_FILE_EXTS, SKIP_DIRS } from "./files.ts";
import { fixSourceReport } from "./fix/engine.ts";
import { buildDocModel, DIAGRAM_EXTS, documentKind } from "./model.ts";
import { PROFILES } from "./parse/contrast.ts";
import { PRESET_NAMES } from "./parse/metrics.ts";
import type { PluginFailure } from "./plugins/index.ts";
import { setUp } from "./project.ts";
import { RULES } from "./rules/index.ts";
import type { LoadedSource, Registry } from "./rules/registry.ts";
import { CATEGORIES, type Finding, type Rule } from "./rules/types.ts";

// The invocation forms, printed alone after a usage error so the error is not
// buried, and first in --help.
const SYNOPSIS = `usage: mermaidjs-lint <path...> [--fix] [--json] [--preset NAME] [--profile NAME] [--config FILE]
                     [--canvas-light COLOUR] [--canvas-dark COLOUR] [--no-plugins | --lenient-plugins]
                     [--category NAME]... [--disable-category NAME]...
       mermaidjs-lint --list-rules [--config FILE] [--no-plugins | --lenient-plugins] [category flags]
       mermaidjs-lint --validate-plugins [--json] [--config FILE]
       mermaidjs-lint --version | -h, --help`;

// One rule as help and --list-rules print it: the id padded to a column, the
// autofix marker inside it, then the summary, so every summary lines up.
const ruleRow = (r: Rule, width: number): string => `${`${r.id}${r.fix ? "*" : ""}`.padEnd(width)}  ${r.summary}`;

const idWidth = (rules: Rule[]): number => Math.max(0, ...rules.map((r) => r.id.length + 1));

const USAGE = `${SYNOPSIS}

Deterministic Mermaid diagram gates (* = autofixable):
${CATEGORIES.map((c) =>
  [`  ${c}:`, ...RULES.filter((r) => r.category === c).map((r) => `    ${ruleRow(r, idWidth(RULES))}`)].join("\n"),
).join("\n")}

A path is a file or a directory, and every path must exist. A file ending in
${DIAGRAM_EXTS.join(" or ")} is read as one raw diagram, and any other file is read as markdown
whose mermaid fences are checked. A directory is walked for ${[...DIAGRAM_FILE_EXTS].join(", ")} files,
skipping dot-folders and ${[...SKIP_DIRS].join(", ")}. The walk does not follow a symbolic link,
and names each one it skipped. A link named as a path is read, but --fix does not write
through one whose target is outside the project root.
Examples of every rule, with fixes: https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/

-p, --preset NAME sets the density for every complexity rule: ${PRESET_NAMES.join(", ")}
  (aliases low, medium, high). It overrides a preset set in the config, and a
  numeric threshold set in the config overrides both.
--profile NAME sets how contrast is read: ${PROFILES.join(", ")}. It overrides a profile set in the config.
  auto reads mkdocs-material when any parent folder holds mkdocs.yml or mkdocs.yaml, else github.
--canvas-light COLOUR and --canvas-dark COLOUR set the page a host draws in each theme, under the github
  profile only. A translucent fill, an edge label box and a sequence diagram's page-backed text are scored
  on it. Each is an opaque CSS colour such as #faf8f9, and a side not given keeps the config's, or GitHub's
  (#ffffff light, #0d1117 dark). A file scored under mkdocs-material refuses a canvas flag with a usage
  error, and sets a config canvas aside when auto picked the profile.
--disable-category NAME turns off every rule in that category for this run, after the config is applied.
--category NAME turns on every rule in that category for this run, even one the config turns off.
  Each may be repeated or take a comma-separated list, such as --disable-category parse,complexity.
  A category that is not loaded, one named by both flags, or a run left with no rule is a usage error.
--json prints one JSON object instead of text lines.
--fix applies every fix it can prove safe, then reports what remains.
A fixer that is unsure leaves the text alone and the finding stays.
--config FILE reads that config instead of mermaidjs-lint.config.json or .mjs at the project root.
Plugins load on their own from .mermaidjs-lint/rules, from dependencies named mermaidjs-lint-plugin,
  mermaidjs-lint-plugin-* or @scope/mermaidjs-lint-plugin(-*), and from the config's plugins list.
--no-plugins runs the built-in rules only and loads no plugin. It reads a .json config as usual,
  and stops with a usage error rather than import a .mjs config, which is code.
--lenient-plugins skips a plugin that fails to load and says so, instead of stopping the run.
--validate-plugins imports and checks every plugin, reports every failure, and runs no check or fix.
--list-rules prints every active rule by category, including plugin rules, and where each plugin came from.
  It imports the plugins to list them. It takes the category flags, to preview a run, and no path or other flag.
--version prints the version, to quote in a bug report.
Exits 0 when no findings remain, 1 when findings remain, a plugin fails to load or the run fails (a lenient run
skips a broken plugin, so it alone does not exit 1), and 2 on a usage error.`;

interface Parsed {
  values: {
    fix?: boolean;
    json?: boolean;
    help?: boolean;
    preset?: string;
    profile?: string;
    "canvas-light"?: string;
    "canvas-dark"?: string;
    config?: string;
    "no-plugins"?: boolean;
    "lenient-plugins"?: boolean;
    "validate-plugins"?: boolean;
    "list-rules"?: boolean;
    version?: boolean;
    category?: string[];
    "disable-category"?: string[];
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
      "canvas-light": { type: "string" },
      "canvas-dark": { type: "string" },
      config: { type: "string" },
      "no-plugins": { type: "boolean", default: false },
      "lenient-plugins": { type: "boolean", default: false },
      "validate-plugins": { type: "boolean", default: false },
      "list-rules": { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      category: { type: "string", multiple: true },
      "disable-category": { type: "string", multiple: true },
    },
    allowPositionals: true,
    strict: true,
  });

// A category flag may be repeated or take a comma-separated list. A category
// word never holds a comma, so the split cannot change a name. An empty item,
// as in "parse,", is refused rather than dropped.
const categoryWords = (flag: string, values: string[] | undefined): string[] =>
  (values ?? []).flatMap((value) =>
    value.split(",").map((word) => {
      const trimmed = word.trim();
      if (!trimmed) throw new FlagError(flag, `${flag} needs a category name, not "${value}"`);
      return trimmed;
    }),
  );

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
  const width = idWidth(registry.rules);
  for (const [category, description] of registry.categories) {
    const rules = registry.rules.filter((r) => r.category === category);
    if (rules.length === 0) continue;
    lines.push(`${category}: ${description}`);
    for (const r of rules) lines.push(`  ${ruleRow(r, width)}`);
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

// One finding as the text report prints it: file, line or line range, rule
// and message. The site generator prints its examples with this too.
export const reportLine = (f: Finding, file: string): string => {
  const where = f.endLine > f.line ? `${f.line}-${f.endLine}` : `${f.line}`;
  return `${file}:${where} ${f.rule} ${f.message}`;
};

const display = (file: string, cwd: string): string => {
  const rel = relative(cwd, file);
  return !rel || rel.startsWith("..") ? file : rel;
};

// --fix writes through a symbolic link to its target, so a link whose target
// sits outside the project root would let a run edit a file in another tree.
// Every such link is refused before any file is written.
const refuseOutsideLinks = async (files: string[], root: string, cwd: string): Promise<void> => {
  const realRoot = await realpath(root);
  for (const file of files) {
    if (!(await lstat(file)).isSymbolicLink()) continue;
    const target = await realpath(file);
    const rel = relative(realRoot, target);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new FixOutsideRootError(display(file, cwd), target, root);
  }
};

type Values = Parsed["values"];

const parseArgv = (argv: string[]): Parsed => {
  try {
    return parse(argv);
  } catch (err) {
    throw new FlagError("argv", err instanceof Error ? err.message : String(err));
  }
};

const runFlagsOf = (values: Values): RunFlags => {
  const canvas = {
    ...(values["canvas-light"] !== undefined && { light: values["canvas-light"] }),
    ...(values["canvas-dark"] !== undefined && { dark: values["canvas-dark"] }),
  };
  return {
    preset: values.preset,
    profile: values.profile,
    ...(Object.keys(canvas).length > 0 && { canvas }),
  };
};

const checkPluginFlags = (values: Values): void => {
  if (values["no-plugins"] && values["lenient-plugins"]) {
    throw new FlagError("--lenient-plugins", "--no-plugins and --lenient-plugins contradict each other");
  }
  if (values["validate-plugins"] && (values["no-plugins"] || values.fix || values["list-rules"])) {
    throw new FlagError("--validate-plugins", "--validate-plugins takes no --no-plugins, --fix or --list-rules");
  }
};

// --list-rules prints the rules the config and the plugin flags leave
// active. Any other flag or a path would be silently ignored, so it is refused.
const checkListingFlags = (values: Values, positionals: string[]): void => {
  const ignored = [
    ...(["fix", "json", "preset", "profile", "canvas-light", "canvas-dark"] as const)
      .filter((name) => values[name] !== undefined && values[name] !== false)
      .map((name) => `--${name}`),
    ...(positionals.length > 0 ? ["a path"] : []),
  ];
  if (ignored.length > 0) {
    throw new FlagError(
      "--list-rules",
      `--list-rules takes only --config and --no-plugins or --lenient-plugins, not ${ignored.join(", ")}`,
    );
  }
};

// The paths each mode takes: a check needs at least one, validation none.
const checkPositionals = (values: Values, positionals: string[]): void => {
  const validating = values["validate-plugins"];
  if (validating && positionals.length > 0) {
    throw new FlagError("files", "--validate-plugins runs no check, so it takes no files");
  }
  if (positionals.length === 0 && !(values["list-rules"] || validating)) {
    throw new FlagError("files", "no files given");
  }
};

interface CategoryWords {
  enable: string[];
  disable: string[];
}

// The category flags as word lists, after every flag they combine with is checked.
const checkCombinations = (values: Values, positionals: string[]): CategoryWords => {
  checkPluginFlags(values);
  const enable = categoryWords("--category", values.category);
  const disable = categoryWords("--disable-category", values["disable-category"]);
  const validating = values["validate-plugins"];
  // Validation loads every plugin whatever the category flags say, so it
  // refuses them rather than ignore them.
  if (validating && enable.length + disable.length > 0) {
    throw new FlagError("--validate-plugins", "--validate-plugins checks every plugin, so it takes no category flag");
  }
  if (values["list-rules"] && !validating) checkListingFlags(values, positionals);
  checkPositionals(values, positionals);
  return { enable, disable };
};

const printValidation = (registry: Registry, failures: PluginFailure[], json: boolean): number => {
  const result = validate(registry, failures, json);
  for (const line of result.stderr) console.error(line);
  if (result.stdout) console.log(result.stdout);
  return result.code;
};

// The files the paths name, refusing an unreadable path or an empty walk, and
// naming each symbolic link the walk skipped.
const filesToCheck = (positionals: string[], cwd: string): string[] => {
  const { files, unreadable, symlinks } = collectFiles(positionals.map((p) => resolve(cwd, p)));
  if (unreadable.length > 0) throw new FlagError("files", `cannot read ${unreadable.join(", ")}`);
  for (const link of symlinks) {
    console.error(`mermaidjs-lint: skipped symbolic link ${display(link, cwd)}; name it as a path to check it`);
  }
  if (files.length === 0) throw new FlagError("files", "no matching files");
  return files;
};

// A config canvas is set aside for a file the auto profile reads as
// mkdocs-material, and one line names every such file, so the run says what
// it scored without the canvas. The --json object carries the same paths, so
// a job that reads only stdout still learns the canvas was dropped.
const reportSetAside = (files: string[], flags: RunFlags, registry: Registry, cwd: string): string[] => {
  const setAside = files.filter((file) => canvasSetAside(file, flags, registry)).map((f) => display(f, cwd));
  if (setAside.length > 0) {
    console.error(
      `mermaidjs-lint: config canvas set aside for ${plural(setAside.length, "file")} scored under mkdocs-material: ${setAside.join(", ")}`,
    );
  }
  return setAside;
};

interface FileRun {
  flags: RunFlags;
  registry: Registry;
  fix: boolean;
  cwd: string;
}

// Every rule, in check and in fix, sees the file as an absolute path, so a
// rule that reads the path sees one form, and the auto profile is found
// from the file's own folder whatever the process's working directory. The
// report shows the path relative to cwd.
const checkFile = async (file: string, { flags, registry, fix, cwd }: FileRun): Promise<Finding[]> => {
  let src = await readFile(file, "utf8");
  if (fix) {
    const fixed = (await fixSourceReport(src, file, flags, registry)).output;
    if (fixed !== src) {
      await writeFile(file, fixed);
      src = fixed;
    }
  }
  const shown = display(file, cwd);
  const found = await checkModel(buildDocModel(src, documentKind(file)), file, flags, registry);
  return found.map((f) => ({ ...f, file: shown }));
};

interface Report {
  all: Finding[];
  files: number;
  registry: Registry;
  failures: PluginFailure[];
  setAside: string[];
}

const printReport = (json: boolean, { all, files, registry, failures, setAside }: Report): void => {
  if (json) {
    const skippedPlugins = failures.map((f) => ({
      source: f.source,
      kind: f.kind,
      code: f.error.code,
      message: reasonOf(f),
    }));
    console.log(
      JSON.stringify(
        { findings: all, files, plugins: registry.sources, skippedPlugins, canvasSetAside: setAside },
        null,
        2,
      ),
    );
    return;
  }
  for (const f of all) console.log(reportLine(f, f.file));
  console.log(`${all.length} finding(s) in ${files} file(s)`);
};

const run = async (argv: string[], cwd: string): Promise<number> => {
  const { values, positionals } = parseArgv(argv);
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.version) {
    console.log(pkg.version);
    return 0;
  }
  const flags = runFlagsOf(values);
  checkRunFlags(flags, "--");
  const { enable, disable } = checkCombinations(values, positionals);

  const { root, registry, skipped, failures } = await setUp({
    cwd,
    configPath: values.config,
    noPlugins: values["no-plugins"],
    lenient: values["lenient-plugins"],
    collect: values["validate-plugins"],
    selection: { enable, disable, prefix: "--" },
  });

  if (values["validate-plugins"]) return printValidation(registry, failures, Boolean(values.json));

  const note = loadedLine(registry.sources, skipped);
  if (note) console.error(note);
  for (const line of skippedLines(failures, registry.ignoredSettings)) console.error(line);
  if (values["list-rules"]) {
    console.log(listRules(registry));
    return 0;
  }

  const files = filesToCheck(positionals, cwd);
  const fix = Boolean(values.fix);
  if (fix) await refuseOutsideLinks(files, root, cwd);
  const setAside = reportSetAside(files, flags, registry, cwd);
  const perFile = await Promise.all(files.map((file) => checkFile(file, { flags, registry, fix, cwd })));
  const all = perFile.flat();
  printReport(Boolean(values.json), { all, files: files.length, registry, failures, setAside });
  return all.length > 0 ? 1 : 0;
};

// The line printed for a failure: its stable code, then the reason.
export const describeError = (err: unknown): string =>
  err instanceof MermaidLintError
    ? `error[${err.code}]: ${err.message}`
    : `error: ${err instanceof Error ? err.message : String(err)}`;

// A usage error prints its reason, the invocation forms and a pointer to
// --help, and exits 2. Anything else is a runtime failure and propagates to
// bin.ts, which exits 1.
export const main = async (argv: string[] = process.argv.slice(2), cwd: string = process.cwd()): Promise<number> => {
  try {
    return await run(argv, cwd);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(describeError(err));
    console.error(SYNOPSIS);
    console.error("run mermaidjs-lint --help for more");
    return 2;
  }
};
