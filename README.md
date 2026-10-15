# jpai-mermaidjs-lint

Diagrams in documentation should be readable.
Deterministic checks and verified fixes for Mermaid diagrams in markdown.

**[Docs](https://jpeakai.github.io/jpai-mermaidjs-lint/)** | **[Rules](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/)** | **[GitHub](https://github.com/jpeakai/jpai-mermaidjs-lint)** | **[npm](https://www.npmjs.com/package/@jpeakai/mermaidjs-lint)**

## Usage

```sh
bunx @jpeakai/mermaidjs-lint README.md docs/     # report findings, exit 1 if any
npx -y @jpeakai/mermaidjs-lint --fix docs/       # apply every fix proven safe, report the rest
```

A path is a `.mmd` file, a markdown file whose mermaid fences are checked, or a directory, which is walked for both.
Installed as a dev dependency, the command is `mermaidjs-lint`, and `--help` lists every flag.

[Get started](https://jpeakai.github.io/jpai-mermaidjs-lint/get-started/) walks through a first run, a fix, and adding the check to a project.

## What it checks

| Category | What it guards |
|---|---|
| Parse | Whether mermaid can read the diagram, and whether its fence is whole |
| Complexity | How much a reader must hold in mind at once, measured against a density preset |
| Contrast | Whether labels and borders can be read against their fills, as the host renders them |

`mermaidjs-lint --list-rules` prints every rule.
The [rules page](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/) draws each one before and after `--fix`, and [RULES.md](RULES.md) holds the same examples as plain markdown.

Every finding fails the run, and a rule you do not want is switched off in the config.
Structure comes from mermaid's own parsers, never from patterns over the text.
Every fix is verified by parsing the document again.
A fix that would change anything else is refused, so the finding stays for a human.

## Configure and extend

- [Configure the rules](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/configure/): switch a rule off, change the complexity preset, set options.
- [Lint a MkDocs Material site](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/mkdocs/): score diagrams the way the theme renders them.
- [Write a local rule](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/local-rule/) or [publish a plugin package](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/plugin-package/): add rules of your own, which load with no config.

## Library use

```ts
import { checkMarkdown, fixSource } from "@jpeakai/mermaidjs-lint";

const findings = await checkMarkdown(src, "README.md");
const fixed = await fixSource(src, "README.md");
```

The [document model](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/document-model/) and [plugin API](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/plugin-api/) pages list the types.

## Origin

The checks port the logic of the `mermaidjs-diagrams` skill scripts, which measured complexity and contrast for Mermaid diagrams.
The package shape, the plugin mechanism and the fix verification follow [jpai-prose-gates](https://github.com/jpeakai/jpai-prose-gates).
The reasoning behind each choice is recorded in [`adrs/`](adrs/index.md).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and how a change is accepted.
