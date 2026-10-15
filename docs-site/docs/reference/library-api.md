# Library API

Every export of `@jpeakai/mermaidjs-lint`, for running the linter from code.
The rule-facing types are on [Document model](document-model.md) and [Plugin API](plugin-api.md).
[Versioning](index.md#versioning) says which of these exports are stable.

## Built-in rules unless you pass a registry

`checkMarkdown`, `checkModel`, `fixSource` and `fixSourceReport` default to `BUILTIN`, the built-in rules with every rule on.
On their own they read no config file and load no plugin.
To get what the command does, build the registry with `setUp` and pass it in:

```ts
import { readFile } from "node:fs/promises";
import { checkMarkdown, setUp } from "@jpeakai/mermaidjs-lint";

const { registry } = await setUp({ cwd: process.cwd() });
const src = await readFile("docs/architecture.md", "utf8");
const findings = await checkMarkdown(src, "docs/architecture.md", {}, registry);
```

`setUp` throws the same errors the command reports, so a bad config or a broken plugin fails here, before any file is read.

## Checking

| Export | Signature | Returns |
|---|---|---|
| `checkMarkdown` | `(src: string, file: string, flags: RunFlags = {}, registry: Registry = BUILTIN)` | `Promise<Finding[]>`, sorted by line then rule id |
| `checkModel` | `(doc: DocModel, file: string, flags: RunFlags = {}, registry: Registry = BUILTIN)` | `Promise<Finding[]>` for a model you built |
| `RunFlags` | `{ preset?: string; profile?: string }` | The run-level settings `--preset` and `--profile` give |

A `file` ending in `.mmd` is read as one diagram, and any other name as markdown.
The `file` also decides the `auto` contrast profile, so pass the real path when the profile matters.

## Fixing

| Export | Signature | Returns |
|---|---|---|
| `fixSource` | `(src: string, file: string, flags: RunFlags = {}, registry: Registry = BUILTIN)` | `Promise<string>`, the fixed source |
| `fixSourceReport` | the same parameters | `Promise<FixReport>` |
| `FixReport` | `{ output: string; applied: Edit[]; refused: Edit[] }` | The fixed source, and the edits kept and refused |

Neither writes a file.
Run a check on the output to see which findings remain.

## Setting up a run

| Export | Signature | Returns |
|---|---|---|
| `setUp` | `({ cwd, configPath?, noPlugins = false, lenient = false, collect = false })` | `Promise<{ registry, skipped, failures }>` |
| `findProjectRoot` | `(cwd: string)` | `Promise<string>`, the nearest ancestor with a `package.json`, a config file or a `.mermaidjs-lint` folder, else `cwd` |
| `loadConfig` | `(file: string)` | `Promise<Config>` from a `.json` or `.mjs` file |
| `parseConfig` | `(file: string, raw: unknown)` | `Config`, validated, where `file` names the source in errors |
| `buildRegistry` | `(input: RegistryInput)` | `Registry`, with the config applied |
| `BUILTIN` | `Registry` | The built-in rules, all on |
| `BUILTIN_CATEGORIES` | `ReadonlyMap<string, string>` | Each built-in category to its description |

The `setUp` options mirror the flags:

| Option | Flag |
|---|---|
| `configPath` | `--config` |
| `noPlugins` | `--no-plugins` |
| `lenient` | `--lenient-plugins` |
| `collect` | `--validate-plugins` |

`skipped` names the plugins discovered but not loaded under `noPlugins`.
`failures` holds the plugins a lenient or collecting run left out, each with its source and error.

## Running the command

| Export | Signature | Returns |
|---|---|---|
| `main` | `(argv: string[] = process.argv.slice(2), cwd: string = process.cwd())` | `Promise<number>`, the exit code |
| `collectFiles` | `(paths: string[])` | `{ files: string[]; unreadable: string[] }`, walking directories as the command does |

`main` prints to standard output and standard error as the command does.
It returns 2 on a usage error and throws on a runtime failure, which the command turns into exit code 1.

## Reading diagrams

| Export | Signature | Returns |
|---|---|---|
| `buildDocModel` | `(src: string, kind: "markdown" \| "diagram" = "markdown")` | `DocModel` |
| `extractStats` | `(content: string)` | `Promise<DiagramStats>` for one diagram's text |
| `detectKeyword` | `(content: string)` | `string \| null`, the diagram's first word past frontmatter and comments |
| `PRESETS` | `Record<string, Preset>` | Each density preset's thresholds |
| `thresholdsFrom` | `(options: Record<string, unknown>)` | The thresholds a complexity rule runs with, from its options |

## Rules and categories

| Export | Holds |
|---|---|
| `RULES` | Every built-in `Rule` |
| `FIX_ORDER` | The built-in rules with a fixer, in the order the engine runs them |
| `RULE` | Each built-in rule id, keyed by a constant name |
| `CATEGORIES` | The built-in category words: `parse`, `complexity`, `contrast` |

## Errors

Every error class in [Error codes](cli.md#error-codes) is exported, so code can branch on the class or on its `code`.
`UsageError` is the parent of every usage error, and `PluginLoadError` the parent of every load error.
Both extend `MermaidLintError`, which carries the `code`.

## Types

The package also exports these types:

- **Run and config:** `RunFlags`, `Config`, `RuleSetting`, `Severity`, `PluginLoading`, `Registry`, `RegistryInput`, `LoadedSource`.
- **Document:** `DocModel`, `Diagram`, `StyleDirective`, `ValueSpan`, `ContrastAssessment`, `DiagramStats`.
- **Rules:** `Rule`, `RuleId`, `CoreRuleId`, `PluginRuleId`, `Category`, `RuleContext`, `CheckContext`, `FixContext`, `RuleOptions`, `OptionSpec`, `OptionType`, `Helpers`.
- **Results:** `Finding`, `Edit`, `Expectation`, `FixReport`.
- **Plugins:** `Plugin`, `PluginMeta`, `PluginRule`, `PluginFinding`, `PluginEdit`.

The testing helpers live in a second entry point, `@jpeakai/mermaidjs-lint/testing`, listed on [Plugin API](plugin-api.md#testing-helpers).
