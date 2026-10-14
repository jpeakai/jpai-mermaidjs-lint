# Glossary

The ubiquitous language for `jpai-mermaidjs-lint`.
One canonical name per concept, used in code, in documents and in conversation.

Agents and contributors: use these terms rather than synonyms.
When a new domain term enters the code or the conversation, add it here in the same change.

| Term | Meaning |
|---|---|
| Diagram | One Mermaid source: a mermaid fence in a markdown file, or a whole `.mmd` file. |
| Fence | The code block that holds a diagram in markdown. It is unterminated when it never closes. |
| Rule | One deterministic check with a rule id, and optionally a fixer. Also called a gate. |
| Rule id | The name of a rule, written category-short-name, such as contrast-text-below-aa. |
| Category | The group a rule belongs to: parse, complexity or contrast, or a one-word category a plugin declares. |
| Finding | One reported violation, with a file, a line range, a rule id, a message and a remediation. |
| Parse engine | The code that reads a diagram's structure from mermaid's own parsers. |
| Stats | The nodes, edges, subgraphs and nesting depth the parse engine reads from a diagram. |
| Visual complexity score | Nodes plus half a point per edge plus three per subgraph, scaled by one tenth per level of nesting. Also called VCS. |
| Preset | A named set of density thresholds: low-density, medium-density or high-density. |
| Ladder | The ordered thresholds of one measure. A diagram lands in one band, so one rule of the ladder fires. |
| Style directive | A classDef, style or linkStyle line, or an inline class application. |
| Pair | A foreground and a background scored together: text is fill and color, border is fill and stroke. |
| Profile | How contrast is read: github scores declared pairs, mkdocs-material scores the host's forced text. |
| Unauditable | A directive the profile requires to be scoreable but cannot be, such as a fill with no color. |
| Fixer | The optional fix function of a rule. It proposes edits and never writes files itself. |
| Edit | A proposed change: a start offset, an end offset, replacement text and an expectation. |
| Expectation | What an edit claims about the reparsed document: same-diagrams or same-tree. |
| Refusal | A fixer or the verifier declining an edit. The source is untouched and the finding stays. |
| Fixpoint | The engine's loop of applying verified edits in a fixed rule order until nothing changes. |
| Plugin | A module that adds rules to a run, with a name, a namespace, a contract version and optional categories. |
| Namespace | The word before the slash in a plugin rule id, such as acme in acme/parse-no-todo. A core id has none. |
| Local rule | A plugin rule that is one file in `.mermaidjs-lint/rules`, under the reserved namespace local. |
| Config file | The optional `mermaidjs-lint.config.json` or `.mjs` that switches rules off and sets their options. |
| Project root | The nearest ancestor of the working directory with a package.json, a config file or a `.mermaidjs-lint` directory. |
| Registry | The rules a run uses: the built-ins plus loaded plugins, with the config applied. |
| Plugin mode | How a plugin that fails to load is treated: off, strict, lenient or collect. Strict is the default. |
| Error code | The stable kebab-case name of a failure, shown as error[code] and carried on the error class. |
| Adversarial test | A hostile input written to break a fixer, asserting a refusal or an exact safe output. |
| Record | One decision, authored as YAML in `adrs/`. Its markdown is generated and never edited. |
| Bundle | The `adrs/` directory as a whole, including the records and everything generated from them. |
| Dialect | This repo's declared documentation conventions, in `docs/CONVENTIONS.md`. |
| Release | One version published to npm by the Publish workflow, with a matching tag and GitHub release. |
