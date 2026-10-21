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
| `RunFlags` | `{ preset?: string; profile?: string; canvas?: CanvasSetting }` | The run-level settings `--preset`, `--profile`, `--canvas-light` and `--canvas-dark` give |
| `CanvasSetting` | `{ light?: string; dark?: string }` | The page colour in each theme. A side left out keeps the config's, or GitHub's. |
| `GITHUB_CANVAS` | `{ light: "#ffffff", dark: "#0d1117" }` | The default canvas, as a `Canvas` with both sides set |
| `canvasSetAside` | `(file: string, flags: RunFlags = {}, registry: Registry = BUILTIN)` | `boolean`: whether a check of `file` sets a config canvas aside, because `auto` scores it under `mkdocs-material` |

A `file` ending in `.mmd` or `.mermaid` is read as one diagram, and any other name as markdown.
The `file` also decides the `auto` contrast profile, so pass the real path when the profile matters.
A relative `file` resolves against `process.cwd()`, not the folder of the source you read.
So `checkMarkdown(src, "README.md")` looks for a `mkdocs.yml` above the working directory.

Pass `{ profile: "github" }` or `{ profile: "mkdocs-material" }` as the flags to fix the profile instead.
A check or a fix rejects an unknown `preset` or `profile` with a `FlagError`, whose `flag` is `preset` or `profile`.

Pass `canvas` when the host draws its own page, as [A host with its own page sets a canvas](../concepts/contrast.md#a-host-with-its-own-page-sets-a-canvas) explains:

```ts
await checkMarkdown(src, "doc.md", { profile: "github", canvas: { light: "#faf8f9", dark: "#101010" } });
```

A canvas side that will not parse, or is translucent, is a `FlagError` whose `flag` is `canvas.light` or `canvas.dark`.
So is a canvas in `flags` beside `profile: "mkdocs-material"` in `flags`.
A file that `auto` or the config scores under `mkdocs-material` rejects a canvas from `flags` with a `CanvasProfileError`.
A canvas from the registry's config beside `profile: "mkdocs-material"` in `flags` is a `CanvasProfileError` too.

A canvas from the registry's config is set aside for a file that `auto` scores under `mkdocs-material`, with no error and no note.
Call `canvasSetAside(file, flags, registry)` to learn when that happens, since the library gives no other signal.

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
| `setUp` | `({ cwd, configPath?, noPlugins = false, lenient = false, collect = false })` | `Promise<Setup>`, which is `{ root, registry, skipped, failures }` |
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

`root` is the project root the config and plugins were found from. `skipped` names the plugins discovered but not loaded under `noPlugins`, or under `"plugins": false` in the config. `failures` holds the plugins a lenient or collecting run left out, each a `PluginFailure` of `{ source, kind, error }`.

## Running the command

| Export | Signature | Returns |
|---|---|---|
| `main` | `(argv: string[] = process.argv.slice(2), cwd: string = process.cwd())` | `Promise<number>`, the exit code |
| `collectFiles` | `(paths: string[])` | `Collected`, which is `{ files: string[]; unreadable: string[]; symlinks: string[] }`, walking directories as the command does |

`main` prints to standard output and standard error as the command does.
It returns 2 on a usage error and throws on a runtime failure, which the command turns into exit code 1. `cwd` sets the folder relative paths resolve from, and the project root.
The `auto` profile is then found from each file's own folder, so `main` scores files the same from any working directory. `collectFiles` lists, in `symlinks`, every symbolic link a directory walk passed over.

## Reading diagrams

| Export | Signature | Returns |
|---|---|---|
| `buildDocModel` | `(src: string, kind: "markdown" \| "diagram" = "markdown")` | `DocModel` |
| `documentKind` | `(file: string)` | `"markdown" \| "diagram"`, how the command reads a file of that name |
| `DIAGRAM_EXTS` | `readonly string[]` | The extensions read as one raw diagram: `.mmd` and `.mermaid` |
| `extractStats` | `(content: string)` | `Promise<DiagramStats>` for one diagram's text |
| `detectKeyword` | `(content: string)` | `string \| null`, the keyword of the diagram type mermaid detects, such as `flowchart` or `erDiagram`, or `null` when it detects none |
| `PRESETS` | `Record<string, Preset>` | Each density preset's thresholds |
| `thresholdsFrom` | `(options: Record<string, unknown>)` | `ThresholdConfig`, the thresholds a complexity rule runs with, from its options |

`Preset` and `ThresholdConfig` name their fields in snake_case, unlike the camelCase config options.
So the config option `nodeHardLimit` is the field `node_hard_limit`:

```ts
import { PRESETS } from "@jpeakai/mermaidjs-lint";

PRESETS["high-density"]?.node_hard_limit; // the hard limit nodeHardLimit overrides
```

`ThresholdConfig` adds `edge_weight`, `row_weight`, `subgraph_weight`, `depth_weight` and `preset_name` to the `Preset` fields.

## Split plans

A split plan is what `--split-plan` prints: an overview where groups of nodes fold into one group node each, and one detail diagram per group.
It is offered only when a contract on the emitted text proves the overview and details keep every node and edge.
Nothing is applied, per [MJL-0025](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/0025-a-fold-is-offered-as-a-split.md).

| Export | Signature | Returns |
|---|---|---|
| `splitPlan` | `(source: string, config: ThresholdConfig)` | `Promise<SplitPlan \| null>`, a plan for one diagram's text, or `null` when none is offered |
| `splitOutcome` | `(source: string, config: ThresholdConfig)` | `Promise<SplitOutcome>`, which is `{ plan, reason, violations }`: the plan, or why there is none |
| `SplitPlan` | `{ diagram_type, tier, groups, overview, overviewSource, overviewNodes, overviewScore, details, rowDetails, loss, ladder }` | `overviewSource` is the overview's mermaid text, and `tier` the last tier that changed the plan |
| `SplitGroup` | `{ id, label, labelBase, hidden, markdown?, members, regions, parent, tier, reason, shape? }` | One group node: its id `g1`, `g2` and on, the label it shows, the whole label it is taken from, and the original nodes it folds |
| `SplitDetail` | `{ group, graph, stubs, rows, source, nodes, score, split }` | One detail diagram, its stubs mapped to the node or group each stands for, whether it draws its members' rows, and a further plan when the detail is still over the target |
| `RowDetail` | `{ members, graph, source, nodes, score }` | One diagram drawing the rows of nodes the overview keeps |
| `SplitLoss` | `{ newReachablePairs, byTier, droppedRows }` | What the overview draws that the original does not, and the rows no diagram draws |
| `LadderStep` | `{ tier, nodes, score }` | The overview after one tier the plan walked, so `ladder` shows how the plan climbed to the tier that met the target |
| `Tier` | `"T1"` to `"T6"` | The tiers, least lossy first |

`splitPlan` returns `null` for a diagram already within the target, and for one where no plan meets the contract.
It also returns `null` for a type it does not split, such as a sequence diagram. `splitOutcome` names which:

```ts
import { splitOutcome, thresholdsFrom } from "@jpeakai/mermaidjs-lint";

const { plan, reason } = await splitOutcome(source, thresholdsFrom({ preset: "medium-density" }));
console.log(plan ? plan.overviewSource : reason);
```

## Rules and categories

| Export | Holds |
|---|---|
| `RULES` | Every built-in `Rule` |
| `FIX_ORDER` | The built-in rules with a fixer, in the order the engine runs them |
| `RULE` | Each built-in rule id, keyed by a constant name |
| `CATEGORIES` | The built-in category words: `parse`, `complexity`, `contrast` |

## Errors

Every error class behind [Error codes](cli.md#error-codes) is exported, so code can branch on the class or on its `code`.
Every class extends `MermaidLintError`, which carries `code` and `message`.

| Class | `code` | Parent | Extra fields |
|---|---|---|---|
| `UsageError` | `usage` | `MermaidLintError` | None |
| `FlagError` | `flag` | `UsageError` | `flag` |
| `ConfigFileError` | `config-file` | `UsageError` | `file` |
| `ConfigNotFoundError` | `config-not-found` | `UsageError` | `path` |
| `ConfigCodeError` | `config-code` | `UsageError` | `file` |
| `AmbiguousConfigError` | `config-ambiguous` | `UsageError` | `files` |
| `ConfigShapeError` | `config-shape` | `UsageError` | `file`, `key` (or `null`) |
| `RuleSettingError` | `rule-setting` | `UsageError` | `file`, `rule` |
| `UnknownRuleError` | `unknown-rule` | `UsageError` | `file`, `rule`, `known` |
| `RuleOptionError` | `rule-option` | `UsageError` | `file`, `rule`, `option` |
| `CanvasProfileError` | `canvas-profile` | `UsageError` | `file` |
| `FixOutsideRootError` | `fix-outside-root` | `UsageError` | `file`, `target` |
| `PackageJsonError` | `package-json` | `MermaidLintError` | `file` |
| `FixNotConvergingError` | `fix-not-converging` | `MermaidLintError` | `file`, `rules` |
| `PluginLoadError` | `plugin` | `MermaidLintError` | `source` |
| `PluginImportError` | `plugin-import` | `PluginLoadError` | `source` |
| `PluginContractError` | `plugin-contract` | `PluginLoadError` | `source` |
| `PluginConflictError` | `plugin-conflict` | `PluginLoadError` | `source`, `other` |
| `PluginNotInstalledError` | `plugin-not-installed` | `PluginLoadError` | `source`, `root` |
| `PluginSourceError` | `plugin-source` | `PluginLoadError` | `source` |
| `PluginFixerError` | `plugin-fixer` | `MermaidLintError` | `rule` |

The command exits 2 on a `UsageError` and 1 on every other class.
The base classes' own codes, `usage` on `UsageError` and `plugin` on `PluginLoadError`, are defaults, and the command never prints either one alone.
Branch on a subclass code from the table, or on `instanceof` the parent class. `src/errors.ts` is the authority when this table and the code disagree.

## Types

The package also exports these types:

- **Canvas:** `Canvas`, `CanvasSetting`.
- **Run and config:** `RunFlags`, `Config`, `RuleSetting`, `Severity`, `PluginLoading`, `Registry`, `RegistryInput`, `LoadedSource`, `Setup`, `SetupOptions`, `Collected`.
- **Complexity:** `Preset`, `ThresholdConfig`.
- **Document:** `DocModel`, `Diagram`, `StyleDirective`, `ValueSpan`, `ContrastAssessment`, `DiagramStats`.
- **Rules:** `Rule`, `RuleId`, `CoreRuleId`, `PluginRuleId`, `Category`, `RuleContext`, `CheckContext`, `FixContext`, `RuleOptions`, `OptionSpec`, `OptionType`, `Helpers`.
- **Results:** `Finding`, `Edit`, `Expectation`, `FixReport`.
- **Plugins:** `Plugin`, `PluginMeta`, `PluginRule`, `PluginFinding`, `PluginEdit`, `PluginFailure`, `SourceKind`.

The testing helpers live in a second entry point, `@jpeakai/mermaidjs-lint/testing`, listed on [Plugin API](plugin-api.md#testing-helpers).
