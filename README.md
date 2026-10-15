# jpai-mermaidjs-lint

Diagrams in documentation should be readable.
Deterministic checks and verified fixes for Mermaid diagrams in markdown.

**[Docs](https://jpeakai.github.io/jpai-mermaidjs-lint/)** | **[Rules](RULES.md)** | **[GitHub](https://github.com/jpeakai/jpai-mermaidjs-lint)** | **[npm](https://www.npmjs.com/package/@jpeakai/mermaidjs-lint)**

## Usage

```sh
bunx @jpeakai/mermaidjs-lint README.md docs/     # report findings, exit 1 if any
npx -y @jpeakai/mermaidjs-lint --fix docs/       # apply every fix proven safe, report the rest
```

A path is a `.mmd` file, a markdown file whose mermaid fences are checked, or a directory.
A directory is walked for both, and it skips `node_modules`, `dist`, `tmp` and dot-directories.

Installed as a dev dependency, the command is `mermaidjs-lint`, and `--json` gives machine-readable output with a remediation for each finding.

`--preset NAME` sets the density for every complexity rule, as `low`, `medium` or `high`.
`--profile NAME` sets how contrast is read, as `auto`, `github` or `mkdocs-material`.
`--config FILE` reads a config other than the one at the project root.
`--no-plugins` runs the built-in rules only, and `--lenient-plugins` skips a plugin that fails to load and says so.
`--validate-plugins` loads and checks every plugin, reports every failure, and runs no check or fix.
`--list-rules` prints every active rule by category, including plugin rules.
Exit codes are 0 for clean, 1 for findings, and 2 for a usage error.

## The rules

Eleven rules in three categories.
[RULES.md](RULES.md) shows a failing example for each one, and the fix where there is one.
The [docs site](https://jpeakai.github.io/jpai-mermaidjs-lint/) draws every example before and after `--fix`.
There is no warning level, so every finding fails the run.
A rule you do not want is switched off in the config.

| Category | Rules | What it guards |
|---|---|---|
| Parse | parse-diagram-unparseable, parse-fence-unterminated | Whether mermaid can read the diagram, and whether its fence is whole |
| Complexity | complexity-node-count-hard-limit, complexity-node-count-cognitive-limit, complexity-node-count-acceptable-exceeded, complexity-visual-score-critical, complexity-visual-score-acceptable-exceeded, complexity-subgraph-nesting-too-deep | How much a reader must hold in mind at once |
| Contrast | contrast-text-below-aa, contrast-border-below-ui-minimum, contrast-directive-unauditable | Whether labels and borders can be read against their fills |

Structure comes from mermaid's own parsers, never from patterns over the text.
Every fix is verified by parsing the document again.
A fix that would change the markdown or the structure of a diagram is refused, so the finding stays for a human.
The reasoning behind each choice is recorded in [`adrs/`](adrs/index.md).

## Density presets

Complexity rules measure the nodes and a visual complexity score, and compare them with a preset.

| Preset | Acceptable nodes | Cognitive limit | Hard limit |
|---|---|---|---|
| low-density | 12 | 20 | 35 |
| medium-density | 20 | 35 | 60 |
| high-density | 35 | 50 | 100 |

The default is `high-density`, which follows the research that 50 nodes is where a diagram becomes hard to read.
Each threshold is also a rule option, such as `nodeAcceptable` or `vcsCritical`.

## Plugins and local rules

A project adds its own rules without forking this package.
Both sources load on their own, with no config, and every run prints a line saying what it loaded.

- **Local rules.** A `.js`, `.mjs`, `.ts` or `.mts` file in `.mermaidjs-lint/rules/` exports one rule, and its id is `local/` followed by the file name.
- **Plugin packages.** A dependency named `mermaidjs-lint-plugin-name` or `@scope/mermaidjs-lint-plugin-name` loads under the namespace its own `meta.namespace` declares.
- **New categories.** A plugin declares a category of its own, and its rules use it.
- **Same treatment.** A plugin rule is switched off, given options and listed exactly like a built-in, and its fixer is verified like a built-in fixer.

A config at the project root switches rules off and sets options.

```json
{
  "rules": {
    "complexity-subgraph-nesting-too-deep": "off",
    "complexity-node-count-acceptable-exceeded": ["error", { "preset": "medium" }],
    "contrast-text-below-aa": ["error", { "profile": "mkdocs-material" }]
  }
}
```

[docs/plugins.md](docs/plugins.md) is the guide to writing a rule.

## Library use

```ts
import { checkMarkdown, fixSource } from "@jpeakai/mermaidjs-lint";

const findings = await checkMarkdown(src, "README.md");
const fixed = await fixSource(src, "README.md");
```

A plugin author tests a rule with `@jpeakai/mermaidjs-lint/testing`, which runs the same loader checks and verified fixer as a real run.

## Origin

The checks port the logic of the `mermaidjs-diagrams` skill scripts, which measured complexity and contrast for Mermaid diagrams.
The package shape, the plugin mechanism and the fix verification follow [jpai-prose-gates](https://github.com/jpeakai/jpai-prose-gates).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and how a change is accepted.
