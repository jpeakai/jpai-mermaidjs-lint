# Glossary

The ubiquitous language for `jpai-mermaidjs-lint`.
One canonical name per concept, used in code, in documents and in conversation.

Agents and contributors: use these terms rather than synonyms.
When a new domain term enters the code or the conversation, add it here in the same change.

| Term | Meaning |
|---|---|
| Diagram | One Mermaid source: a mermaid fence in a markdown file, or a whole `.mmd` or `.mermaid` file. |
| Raw diagram file | A `.mmd` or `.mermaid` file, read as one diagram with no markdown around it. Its document kind is `diagram`, and its markdown tree is empty. |
| Fence | The code block that holds a diagram in markdown. It is unterminated when it never closes. |
| Tenet | One of the four things the tool exists for: three guarantees about every diagram (readable in light and dark, renders, simple enough to follow) and one commitment about the tool (extensible). Worded once in `docs-site/includes/tenets.md`. |
| Gate | A check that fails the run, with exit 1, while any finding remains. Every rule is a gate, and `make docs-ci` runs the gates over this repo's markdown. |
| Rule | One deterministic check with a rule id, and optionally a fixer. |
| Rule id | The name of a rule, written category-short-name, such as contrast-text-below-aa. |
| Category | The group a rule belongs to: parse, complexity or contrast, or a one-word category a plugin declares. |
| Finding | One reported violation, with a file, a line range, a rule id, a message and optionally a remediation. |
| Remediation | The optional next step a rule attaches to a finding, shown in `--json` output. |
| Parse engine | The code that reads a diagram's structure from mermaid's own parsers. |
| Stats | The nodes, edges, subgraphs, subgraph nesting depth and tree depth the parse engine reads from a diagram. |
| Tree depth | How far a tree-shaped diagram (`mindmap`, `treemap`, `treeView` or `ishikawa`) reaches below its root. It weighs on the visual complexity score, but it is not subgraph nesting. |
| Visual complexity score | Nodes plus half a point per edge plus three per subgraph, scaled by one tenth per level of subgraph nesting or tree depth, whichever is deeper. Written VCS in finding messages. |
| Preset | A named set of density thresholds: low-density, medium-density or high-density. |
| Ladder | The ordered thresholds of one measure. A diagram lands in one band, so one rule of the ladder fires. |
| Band | The range between two thresholds of a ladder, such as above `nodeAcceptable` up to `nodeComplex`. Each band has one rule. |
| Style directive | A `classDef`, `style` or `linkStyle` line, or an inline class application. |
| Theme variable | A colour Mermaid's theme supplies, such as `signalTextColor`, set in frontmatter or an `%%{init}%%` directive or derived by the theme. A `sequenceDiagram` is coloured by theme variables alone. |
| Pair | A foreground and a background scored together. Text is `fill` and `color`, a border is `fill` and `stroke`, an edge label is a `linkStyle` `color` and the label box, host text is the host's forced label colour and `fill`, and a sequence pair is a theme variable and the box or page it is drawn on. |
| Advisory pair | A border pair scored under `mkdocs-material` or in an `erDiagram`, including a sequence diagram's lifeline, arrowhead or activation bar under `mkdocs-material`, that never produces a finding, because a saturated border on a faint fill cannot pass in both themes. |
| Host | Where a diagram is drawn for a reader, such as GitHub or a MkDocs Material site. The host may choose the label colour. |
| Profile | How contrast is read: github scores declared pairs, mkdocs-material scores the host's forced text, and auto picks one from the file's folder. |
| Unauditable | A directive the profile requires to be scoreable but cannot be, such as a `fill` with no `color`, or a sequence diagram config the tool does not model, such as `themeCSS`. |
| Fixer | The optional fix function of a rule. It proposes edits and never writes files itself. |
| Edit | A proposed change: a start offset, an end offset, replacement text and an expectation. |
| Expectation | What an edit claims about the reparsed document: same-diagrams or same-tree. |
| Refusal | A fixer or the verifier declining an edit. The source is untouched and the finding stays. |
| Fixpoint | The engine's loop of applying verified edits in a fixed rule order until nothing changes. |
| Plugin | A module that adds rules to a run, with a name, a namespace, a contract version and optional categories. |
| Namespace | The word before the slash in a plugin rule id, such as acme in acme/parse-no-todo. A core id has none. |
| Local rule | A plugin rule that is one file in `.mermaidjs-lint/rules`, under the reserved namespace local. |
| Config file | The optional `mermaidjs-lint.config.json` or `.mjs` that switches rules off and sets their options. |
| Project root | The nearest ancestor of the working directory with a `package.json`, a config file or a `.mermaidjs-lint` directory, or the working directory when none has one. |
| Registry | The rules a run uses: the built-ins plus loaded plugins, with the config applied. |
| Source kind | Where a plugin came from, shown in `--list-rules` and `--json`: local for a file in `.mermaidjs-lint/rules`, package for a declared `mermaidjs-lint-plugin-*` dependency, config for an entry in the config's `plugins` list. |
| Plugin mode | How a plugin that fails to load is treated: off, strict, lenient or collect. Strict is the default. |
| Error code | The stable kebab-case name of a failure, shown as error[code] and carried on the error class. |
| Adversarial test | A hostile input written to break a fixer, asserting a refusal or an exact safe output. |
| Record | One decision, authored as YAML in `adrs/`. Its markdown is generated and never edited. |
| Fixture | One `.md`, `.mmd` or `.mermaid` file under `tests/fixtures` or `examples/` that the test suite runs as a case. |
| Expect comment | The line in a fixture naming the rule ids it must report, or none for a clean file. |
| Pinned fix | A `<name>.fixed.<ext>` sibling of a fixture holding the exact output of `--fix`. |
| LLM fix | A `<name>.llm.<ext>` sibling of a fixture, or an `llm` block in `RULES.md`, holding the judgement fix an LLM proposed for findings `--fix` leaves. It states its reason in an `llm:` comment and must lint clean. |
| Docs site | The MkDocs Material site under `docs-site/`, whose reference pages are generated from the fixtures, `RULES.md` and `examples/`. |
| Bundle | The `adrs/` directory as a whole, including the records and everything generated from them. |
| Dialect | This repo's declared documentation conventions, in `docs/CONVENTIONS.md`. |
| Release | One version published to npm by the Publish workflow, with a matching tag and GitHub release. |
| Changelog | `CHANGELOG.md`, the curated list of user-visible changes per release, with an Unreleased section for what is on main but not yet released. |
| Agent skill | `skills/mermaidjs-lint/`, the instructions an AI coding agent follows to lint and fix diagrams with this tool, with its eval suite. |
