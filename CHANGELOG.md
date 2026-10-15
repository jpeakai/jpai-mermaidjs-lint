# Changelog

Every change a user of `@jpeakai/mermaidjs-lint` can see, by release.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [semantic versioning](https://semver.org/).
While the package is at `0.x`, a minor release may break the public surface that [Versioning](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/#versioning) lists.

The docs site describes the latest release, because it is published when a release is.
The README on GitHub describes the `main` branch.
Anything under `Unreleased` is on `main` but not yet released.

## [Unreleased]

### Fixed

- Fix verification refuses an edit that leaves a diagram unparseable when it parsed before. `same-diagrams` also requires each diagram's parse result to be unchanged, and `same-tree` refuses an edit that breaks a diagram's parse.
- `complexity-subgraph-nesting-too-deep` no longer fires on the depth of a `mindmap`, `treemap`, `treeView` or `ishikawa`, which draw no subgraphs. Their depth still counts toward the visual complexity score, which is unchanged.

- A `flowchart-elk` diagram is read and measured as a flowchart. 0.3.0 reported it as `parse-diagram-unparseable`.

### Changed

- `DiagramStats` gains `max_tree_depth`, the depth of a tree-shaped diagram. `max_subgraph_depth` is now 0 for `mindmap`, `treemap`, `treeView` and `ishikawa`.
- `same-diagrams` also compares `max_tree_depth`.
- `error[fix-outside-root]` now ends "or run on the target path itself".
- The `parse-fence-unterminated` remediation says to add the closing fence directly after the diagram's last line. It also says to repeat the opening line's prefix: `> ` in a quote, or the item's indent in a list.
- `make evals-dry` writes its report under `tmp/evals-dry/`, so the last live run's report stays as it was.
- The docs site deploys after the Publish workflow succeeds, or when its workflow is run by hand, so it describes the latest release. A pull request or a push to `main` only builds it.
- The agent skill's remediation table covers `parse-fence-unterminated`, and gives `contrast-text-below-aa` its own rows for `mkdocs-material` and a `linkStyle`. It tells the agent to follow a finding's own `remediation` where that says more than the table.

### Upgrading from 0.3.0

- **A plugin fixer may see an edit refused.** An edit that turns a parseable diagram into an unparseable one is refused, and the finding stays. So is a `same-diagrams` edit that makes an unparseable diagram parse.
- **Code that reads `max_subgraph_depth` for a tree-shaped diagram reads 0.** Read `max_tree_depth` instead.

## [0.3.0] - 2026-10-15

### Added

- The package ships `.d.ts` type declarations in `dist/types/`, so a TypeScript project type-checks a plugin with no extra compiler options.
- `error[package-json]`, exit 1, for a project `package.json` that is not a JSON object. A `--no-plugins` run carries on past it. An installed plugin whose `package.json` is not a JSON object fails to load with `error[plugin-source]`, which `--lenient-plugins` skips. 0.2.0 stopped with an uncaught error there.
- `error[fix-not-converging]`, exit 1, names the rules whose fixers never stop proposing edits.
- `error[fix-outside-root]`, exit 2, stops `--fix` before it writes through a symbolic link whose target is outside the project root.
- The library exports the types `Preset`, `ThresholdConfig`, `PluginFailure`, `SourceKind`, `Setup`, `SetupOptions` and `Collected`. `setUp` also returns the project `root`.

### Changed

- A directory walk names each symbolic link it skips on standard error. A link named as a path is still checked.
- `quadrantChart` counts each plotted point as a node, with each quadrant that has a label.
- `timeline` counts each event as a node, and an `xychart` with a numeric x-axis counts the points of its longest series.
- A composite state in `stateDiagram` also counts as a subgraph, so its nesting depth is measured.
- A rule's `ctx.file` is the absolute path in both `check` and `fix` in a command run.
- `main(argv, cwd)` finds the `auto` profile from each file's own folder, whatever the process's working directory.
- `same-tree` on a `.mmd` or `.mermaid` file also requires the diagram's structure to be unchanged, as `same-diagrams` does.
- Two local rule files with one name, such as `house-x.js` and `house-x.mjs`, fail the load with `error[plugin-contract]`.
- A plugin rule may declare the options `preset` and `profile` only as `"string"`, and they keep their built-in meaning.
- A rule key or namespace may not end in a hyphen or hold two in a row.
- A config `plugins` entry that is not installed reports `kind` `config`, not `package`.
- `--help` names every plugin source, says which flags import plugins, and lists exit 1 for a failed run.

### Upgrading from 0.2.0

- **A plugin may fail to load.** Rename a rule key or namespace with a trailing or doubled hyphen. Rename a `preset` or `profile` option that is not a string.
- **Two local rule files with one name fail the load.** Files such as `house-x.js` and `house-x.mjs` loaded as one rule on 0.2.0, and now fail with `error[plugin-contract]`, exit 1. Keep one of them.
- **`--fix` may stop on a symbolic link.** A named link whose target is outside the project root now stops `--fix` with `error[fix-outside-root]`, exit 2, before any file is written. Fix the target in its own project, or run on the target path itself.
- **A plugin author sees two values change.** A rule's `ctx.file` is the absolute path in a command run. A config `plugins` entry that is not installed reports `kind` `config` in `--json`, not `package`.
- **A diagram may newly exceed a complexity limit.** `quadrantChart`, `timeline`, `xychart` and `stateDiagram` now count more nodes, and nested composite states can exceed the nesting limit.

## [0.2.0] - 2026-10-15

### Upgrading from 0.1.1

A project that passed on 0.1.1 can fail on 0.2.0.

- **Every `linkStyle` `color:` is now reported.** No one colour reads on the edge label box in both themes, and `--fix` cannot clear it. Remove the `color:` from the `linkStyle` line.
- **A one-line diagram that does not parse is now reported.** For example, `graph TD; A-->; B[[[` passed on 0.1.1. Repair the syntax.
- **A caret range does not reach 0.2.0.** Under 0.x, `^0.1.1` accepts only 0.1.x releases, so change the range to `^0.2.0`.

### Added

- `--version` prints the version, to quote in a bug report.
- A `.mermaid` file is read as a raw diagram, as a `.mmd` file is.
- The library exports `DIAGRAM_EXTS`, the raw diagram extensions, and `documentKind`, which says how a file name is read.
- The library exports `ConfigCodeError`, the error behind `error[config-code]`.
- `checkMarkdown` and `fixSource` read a file name ending in `.mermaid` as a raw diagram, as they read `.mmd`.
- A `linkStyle` `color:` is scored as edge label text, against Mermaid's own label box in light and dark, under the `github` profile.
- Profile `auto` also reads `mkdocs.yaml`, not only `mkdocs.yml`, as a sign that the site renders through Material.
- `skills/mermaidjs-lint/` is an agent skill that drives the linter, with a live eval suite.
- A documentation site at <https://jpeakai.github.io/jpai-mermaidjs-lint/>, with the rules drawn before and after `--fix`.

### Changed

- `parse-diagram-unparseable` reports any diagram mermaid's parser reports an error for, on one line or many.
- A valid diagram with no nodes, such as `pie` with a `title` line or `info`, is no longer reported as unparseable.
- The parse finding's message carries the parser's own reason.
- `complexity-visual-score-critical` names the complex threshold, `vcsComplex`, which is the value it compares against.
- `--help` states which setting wins: a threshold option, then a `--preset` or `--profile` flag, then the config's preset or profile.
- `--help` lists the folders a directory walk skips.
- The npm page links the docs site as the package's homepage.
- `--no-plugins` sets aside a config setting for a plugin rule, instead of failing on it as an unknown rule.
- A usage error prints the error, the synopsis and a pointer to `--help`, rather than the whole help.
- `--help` links the rules page on the docs site instead of `RULES.md`.

### Security

- `--no-plugins` no longer imports a `mermaidjs-lint.config.mjs`, which is code. The run stops with `error[config-code]` and exit 2 instead, and `--config` with a `.json` config lets it run.

## [0.1.1] - 2026-10-15

The same code as 0.1.0, published again under the next version number.

## [0.1.0] - 2026-10-15

The first release: the parse, contrast and complexity rules, `--fix` with verification, the config file, local rules and plugin packages.

[Unreleased]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/releases/tag/v0.1.0
