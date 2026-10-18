# Changelog

Every change a user of `@jpeakai/mermaidjs-lint` can see, by release.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [semantic versioning](https://semver.org/).
While the package is at `0.x`, a minor release may break the public surface that [Versioning](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/#versioning) lists.

The docs site describes the latest release, because it is published when a release is.
The README on GitHub describes the `main` branch.
Anything under `Unreleased` is on `main` but not yet released.

## [Unreleased]

### Added

- **Split plans for an oversized diagram.** A diagram over a node count or score threshold gets a split plan when one is found.
  The plan is an overview where groups of nodes fold into group nodes, plus one detail diagram per group.
  A plan is offered only when a contract parses the emitted text and finds every node and edge kept, per [MJL-0025](adrs/0025-a-fold-is-offered-as-a-split.md).
- Each node count and score rule ends its remediation with the plan when one is offered.
  The added sentence reads like `Split plan: an overview folding 7 groups (...), and one detail diagram per group`.
  The text before it is unchanged, and no complexity rule gains a fixer.
- `--split-plan` prints, after the report, the overview and every detail diagram of each plan as mermaid fences, under a heading naming `file:line` and the tier.
  It writes no file, exits as a check does, and refuses `--fix`, `--json`, `--list-rules` and `--validate-plugins`.
- The library exports `splitPlan`, `splitOutcome` and the `SplitPlan`, `SplitGroup`, `SplitDetail`, `SplitLoss`, `SplitOutcome` and `Tier` types.
  `Diagram` gains `graph()`, the parser's nodes, edges and subgraphs, read once.
- A docs site page, [Summarising a diagram](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/summarisation/), explains the graph theory behind split plans, the tier ladder and the contract.
  It plans one large diagram under every preset, drawn by the site build from what `splitPlan` returns.
- A split plan folds the author's regions first and folds repeated patterns evenly, per [MJL-0026](adrs/0026-a-split-plan-follows-the-authors-structure.md).
  Group nodes are marked in every diagram type, and a long group label is cut in the middle.
- A detail draws an edge from another group from one stub for that group, and a stub label names what it stands for.
- `DiagramGraph` nodes carry `markdown`, `rows` and `regions`.
  Split plans draw entity attributes and class members in details and in row diagrams, and `--split-plan` prints them.
- A diagram whose composite state has concurrent regions gets no split plan, with the reason `concurrent state regions are not split`.
- A stub's text in a split plan has exactly one reading.
  A text that could name another node, region or group adds the id it stands for, and the contract refuses any stub that reads otherwise.
- A lollipop interface on a folded class hangs from its group in the overview.
- A state's description lines are carried into split plans, and `DiagramGraph` nodes carry `descriptions`.
- The overview merges a start or end marker's transitions into one group into one transition, and `SplitLoss` counts them as `mergedMarkers`.
- `--split-plan` prints a detail that is split again only as its split, so every printed diagram meets the target.
- Suggested grouping pairs only nodes an edge joins, with alike labels breaking ties.
  No plan leaves an overview with fewer than four nodes unless the diagram has fewer than eight.
- A split plan's overview lands near its target.
  Once the target is met, folding stops while the overview would keep fewer than 60% of `nodeTarget`, unless a detail needs more folded.
- `T5` and `T6` keep hubs and decisions as their own nodes, and never group two targets of a decision's differently labelled branches.
- No suggested group hides a single node, and a suggested group is named after the member with the most edges crossing its boundary.
- An undirected link written both ways between two overview nodes is drawn once, and `SplitLoss` counts these as `reversedEdges`.

### Changed

- **A diagram's keyword now comes from mermaid's own type detection, so some values change.** For example, `graph` now reads as `flowchart` and `C4Context` as `c4`.
  A `-beta` or `-v2` keyword drops its suffix.
  A plugin that compares a diagram's keyword with an old value must update it, per [MJL-0022](adrs/0022-start-from-the-official-parsers-output.md).
- The `diagram_type` of an architecture, packet, radar, treemap, treeView or wardley diagram is mermaid's id, such as `architecture`.
- `radar`, `treeView` and `wardley` without their `-beta` suffix are unparseable, because mermaid does not draw them.
- A parse failure is the parser's own error.
  A diagram under frontmatter or a directive that parses with no nodes now passes.
- A parser reason is built from the parser's structured error.
  A line number at the end of a diagram is now the real line.
- Fences are read from micromark's tokens rather than scanned.
  `Diagram` gains `closingFence`, and `DiagramStats` gains `error_line`.
- Contrast style directives are read from mermaid's parsed diagram, not a scan of its text, per [MJL-0022](adrs/0022-start-from-the-official-parsers-output.md).
  Text inside a label is no longer taken for a `classDef`, `style` or `linkStyle`.
  A style joined to another statement by `;` is read.
- `class A,B name` and `:::` give a node its classes, so a node's `style` is scored on what it inherits.
- Each style statement and sequence `rect` is placed by its lexer token, and a value the parser cannot place exactly is never rewritten.
- `classDef a,b` and `linkStyle 0,1` give one directive per id, and their shared `color:` is fixed once.
- A `classDef` or `style` in a type the audit does not model, such as `block-beta`, reports `contrast-directive-unauditable`.
- An unparseable diagram gets no contrast findings, only `parse-diagram-unparseable`.
- A sequence theme variable's line is read from the frontmatter.
  One set in `%%{init}%%` points at the keyword line.
- **Breaking for the library:** `Diagram.directives` is now `Diagram.styles()`, which returns a promise of a `StyleReading`.
  `StyleDirective` loses the `inlineClass` kind and `class_name`.
- `micromark`, `stemmer` and `yaml` are new runtime dependencies.
- A contrast value is placed from the tokens the lexer read for it, and `--fix` refuses more often rather than guess, per [MJL-0027](adrs/0027-gaps-in-the-official-parsers-are-recorded.md).
  A classDiagram's colours are reported but never rewritten, because its lexer reads a statement's declarations as one run of text.
  A value after text mermaid edits out of the line, such as a `;` before a comma, is not rewritten.
  Nor is a value colorjs.io does not read as a colour, such as `rgb(255` where mermaid cuts `rgb(255,255,255)` at its commas.
- A style declaration is read as mermaid's renderer reads it: its value is the text between its first colon and its second.
- A translucent out-of-gamut colour is clipped to sRGB before it is blended over its backdrop, as colorjs.io mixes it.

### Fixed

- A style statement is never placed inside the frontmatter, even when a block scalar there repeats its text.
  The finding pointed at the frontmatter line, and `--fix` rewrote the frontmatter title instead of the diagram.
  A parsed line that more than one source line could be is no longer placed, so its value is not rewritten.
- A stateDiagram `style` inside a composite state, which mermaid does not apply, no longer takes the span of a root state's value.

- A flowchart edge to a subgraph's id, such as `A --> S` where `S` is a subgraph, no longer counts `S` as a node as well.
  Mermaid draws that edge to the subgraph's box, so the diagram's node count drops by one for each such subgraph.
- A stateDiagram's concurrency regions, split by `--` inside a composite state, no longer count as nodes or subgraphs.
  Mermaid draws each region as a dashed-off area of the composite's box, so the states in it count inside the composite.
  A composite with regions now nests one deep, not two.
- A label holding an HTML tag, a `<br>` or a bare `<` is read whole.
  The DOM shim made mermaid's sanitiser drop the text before a tag, and all but the last line of a `<br>` label.
  It also dropped any label holding `<`.
- A label holding an HTML entity, such as `&lt;tag&gt;`, reads back as itself in a split plan's diagrams.

## [0.8.1] - 2026-10-18

### Fixed

- Each worked example on the Measuring complexity page draws its diagram, beside its source and the structure the parser returned.

## [0.8.0] - 2026-10-18

### Changed

- **Complexity scores change for sequence, state, entity and class diagrams.** A diagram near a threshold may cross it either way, per [MJL-0021](adrs/0021-the-score-counts-what-a-reader-must-read.md).
- A `sequenceDiagram` counts only messages as edges.
  Notes, activations, `autonumber` and the lines that open, divide or close a block no longer count.
- A `sequenceDiagram` counts each `box` and each block, such as `loop` or `alt`, as a subgraph.
  A block inside another adds a level of nesting, so blocks nested three deep fire `complexity-subgraph-nesting-too-deep`.
  A `rect` is a background tint, so it is not counted.
- A `stateDiagram` no longer counts start and end markers, their transitions, or notes.
- An `erDiagram` entity's attributes, and a `classDiagram` class's attributes and methods, are rows.
  Each row adds 0.25 points to the visual complexity score, and the new `rowWeight` option sets that weight.
- A `classDiagram` counts each `namespace` as a subgraph.
  A namespace inside another adds a level of nesting.
- `DiagramStats` gains `rows`, and `ThresholdConfig` gains `row_weight`.
  `same-diagrams` also compares `rows`.
- The Measuring complexity page has worked examples for sequence, entity and state diagrams.

### Fixed

- A one-word `box` title in a `sequenceDiagram`, such as `box Shop`, is read as its title rather than as its fill colour.

## [0.7.4] - 2026-10-18

### Changed

- The agent evals page shows each case's original fixture and the file every harness and model left behind.
- The agent evals now cover the tier 1, 2 and 3 models of Claude Code and Codex, with `claude-haiku-5-5` in place of `claude-haiku-4-5`.
  The page shows the new run.

## [0.7.3] - 2026-10-17

### Changed

- The README and the docs site home show package badges: npm version, monthly downloads, Node range, CI, Docs and licence.

## [0.7.2] - 2026-10-17

### Changed

- The docs site home page follows the README section by section.
- Measuring complexity builds the score one idea at a time, with a graph of what mermaid's parser returned for each example and its worked score.
- How a run works and the plugin model gain sequence diagrams, each with a simple and a detailed version.
- The site's OsakaNights theme lives in `docs-site/theme/osakanights/`, ready for another MkDocs Material site to adopt.
- Every Biome complexity rule now fails the check, and the code is refactored to pass with no change in behaviour.

## [0.7.1] - 2026-10-16

### Changed

- The README is now a short front page that shows one command, its output and the fix.
  Everything else links into the docs site.

## [0.7.0] - 2026-10-16

### Added

- `--disable-category NAME` turns off every rule in a category for one run, after the config is applied.
- `--category NAME` turns on every rule in a category for one run, even one the config turns off, with the options the config gives it.
- Each category flag may be repeated or take a comma-separated list, such as `--disable-category parse,complexity`, and works for a plugin's category too.
- `--list-rules` takes the category flags, to show the rules a run would use.
- `buildRegistry` and `setUp` take a `selection` of categories to enable and disable, exported as the `CategorySelection` type.

A category that is not loaded, one named by both flags, or flags that turn off every rule fail with `error[flag]` and exit code 2.
`--validate-plugins` refuses a category flag, since it checks every plugin.
See [MJL-0020](adrs/0020-category-flags-have-the-last-word-for-a-run.md).

## [0.6.3] - 2026-10-16

### Changed

- `--list-rules` refuses a path, `--fix`, `--json`, `--preset`, `--profile`, `--canvas-light` or `--canvas-dark` with `error[flag]`, since it would ignore them.
  It takes only `--config` and `--no-plugins` or `--lenient-plugins`, and its `--help` usage line now lists them.

## [0.6.2] - 2026-10-16

### Added

- The `--json` object carries `canvasSetAside`, the files whose config canvas was set aside because `auto` scores them under `mkdocs-material`.
  Before, only a stderr line named them, so a job reading the JSON object never learnt the canvas was dropped.

## [0.6.1] - 2026-10-16

### Changed

- A canvas from the config no longer stops a run over a file that `auto` scores under `mkdocs-material`.
  The canvas is set aside for that file, which is scored under `mkdocs-material`, and one stderr line names every such file.
  A canvas flag on such a file is still `error[canvas-profile]`.
  So is a canvas from the config or the flags beside a `mkdocs-material` profile from the other.
  A canvas flag beside `--profile mkdocs-material` is still `error[flag]`, and a canvas beside `profile` `mkdocs-material` on one config rule is still `error[rule-option]`.
- The `error[canvas-profile]` hint names the way out of the setting that caused it.

### Added

- `canvasSetAside(file, flags, registry)` in the library says whether a file sets its config canvas aside.

### Fixed

- `--canvas-light` and `--canvas-dark` reach every rule option of type `canvas`, whatever its name.
  Before, a plugin option of that type received them only when it was named `canvas`.

## [0.6.0] - 2026-10-16

### Added

- A host that draws its own page can set the canvas, so page-backed colours are scored on the page a reader sees.
  `--canvas-light` and `--canvas-dark` set it for a run, and a `canvas` option of `{ light, dark }` sets it on the contrast rules in the config.
  The library takes it as `RunFlags.canvas`.
  Translucent fills, edge label boxes and a sequence diagram's page-backed text and lines are scored on it.
  The default stays GitHub's `#ffffff` and `#0d1117`, so a run that sets no canvas reports what it did before.
- The canvas applies under the `github` profile only.
  A file scored under `mkdocs-material` refuses a canvas rather than ignoring it.
  A canvas flag beside `--profile mkdocs-material` is `error[flag]`, and a canvas beside `profile` `mkdocs-material` on one config rule is `error[rule-option]`.
  Any other canvas on such a file is the new `error[canvas-profile]` (`CanvasProfileError`).
- A canvas colour that will not parse, or is translucent, is `error[flag]` from a flag and `error[rule-option]` from the config.
- A plugin rule may declare an option of the new type `canvas`. It receives the canvas flags as the contrast rules do, and its value is checked the same way.

## [0.5.0] - 2026-10-16

### Added

- Sequence diagrams are scored for contrast in light and dark, so the tenet "Readable in light and dark" now covers them.
  Their theme colours are read from frontmatter and `%%{init}%%` directives and resolved by Mermaid's own theme engine.
  Labels, arrows, lifelines, actors, notes, frames, activation bars, numbers and `rect` backgrounds are scored, and messages are scored against the page.
  Findings use the existing contrast rules, and `themeCSS` or an unmodelled theme is reported as `contrast-directive-unauditable`.

### Changed

- `mermaid` is pinned to exactly 11.17.2, because the sequence colours it resolves change between releases.
- The `error[plugin-source]` message for a TypeScript local rule says Node 23 needs 23.6 or newer. Node 23.0 to 23.5 cannot import TypeScript.

### Upgrading from 0.4.2

- **A sequence diagram that passed before may now fail.** One likely cause is a fixed message colour that fades on a dark page. Another is a note with no colours set, which Mermaid's dark theme draws at 4.49 to 1. Set `noteBkgColor` and `noteTextColor` to one readable pair, and leave colours on the page to the theme.

## [0.4.2] - 2026-10-16

### Fixed

- A rule that declares a `preset` option now receives the canonical preset name, such as `high-density`.
  It no longer receives an alias such as `high` as typed.

## [0.4.1] - 2026-10-16

### Changed

- `checkMarkdown`, `checkModel`, `fixSource` and `fixSourceReport` reject an unknown `preset` or `profile` in `RunFlags` with `FlagError`, code `flag`. They rejected with a plain `Error` before.
- `--help` describes `--json`.

## [0.4.0] - 2026-10-16

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

[Unreleased]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.8.1...HEAD
[0.8.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.4...v0.8.0
[0.7.4]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.3...v0.7.0
[0.6.3]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/releases/tag/v0.1.0
