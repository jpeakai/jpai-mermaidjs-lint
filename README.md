# jpai-mermaidjs-lint

Diagrams in documentation should be readable.
Deterministic checks and verified fixes for Mermaid diagrams in markdown.

**[Docs](https://jpeakai.github.io/jpai-mermaidjs-lint/)** | **[Rules](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/)** | **[Changelog](CHANGELOG.md)** | **[GitHub](https://github.com/jpeakai/jpai-mermaidjs-lint)** | **[npm](https://www.npmjs.com/package/@jpeakai/mermaidjs-lint)**

The docs site describes the latest release on npm.
This README, read on GitHub, describes the `main` branch.
A change on `main` that is not yet released is listed under `Unreleased` in the [changelog](CHANGELOG.md).

## Usage

```sh
bunx @jpeakai/mermaidjs-lint README.md docs/     # report findings, exit 1 if any
npx -y @jpeakai/mermaidjs-lint --fix docs/       # apply every fix proven safe, report the rest
```

Pass your own paths: every path you name must exist, or the run stops with a usage error and exit 2.
A `.mmd` or `.mermaid` file is read as one diagram, and any other file you name is read as markdown.
A directory is walked for `.mmd`, `.mermaid`, `.md` and `.markdown` files.
Installed as a dev dependency, the command is `mermaidjs-lint`, and `--help` lists every flag.

[Get started](https://jpeakai.github.io/jpai-mermaidjs-lint/get-started/) walks through a first run, a fix, and adding the check to a project.

## The four tenets

Three tenets are guarantees about every diagram the tool passes, and the fourth is a commitment about the tool.

- **Readable in light and dark.** Declared fills, label colours and borders are scored as the host draws them, on nodes, erDiagram rows, edge labels and sequence diagrams, in both themes.
- **Renders.** Every diagram parses with the mermaid parsers this package ships, and every mermaid fence is closed.
- **Simple enough to follow.** Node count and visual complexity are scored against a density preset, so an oversized diagram is flagged to be split.
- **Extensible.** A plugin adds rules of your own, which run through the same config, fix engine and verification as the built-ins.

| Tenet | Delivered by |
|---|---|
| Readable in light and dark | The contrast rules |
| Renders | The parse rules |
| Simple enough to follow | The complexity rules |
| Extensible | Local rules and plugin packages |

The [concepts page](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/) states the limit of each tenet.
`bunx @jpeakai/mermaidjs-lint --list-rules` prints every rule.
The [rules page](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/) draws each one before and after `--fix`, and [RULES.md](RULES.md) holds the same examples as plain markdown.

Every finding fails the run, and a rule you do not want is switched off in the config.
Node, edge and subgraph counts come from mermaid's own parsers.
Style directives are read line by line, so a style joined to other statements by a semicolon is not seen.
Every fix is verified by parsing the document again, and a fix that fails the check is refused, so the finding stays for a human.
The check holds the markdown outside the diagrams unchanged, and each diagram's type, node ids, subgraph names and counts, and whether it parses.
It does not compare edge endpoints, edge labels or node text, so review the diff a fix writes.

## Requirements and compatibility

- **Runtime:** Bun, or Node `>=20` as the `engines` field of `package.json` states.
- **Mermaid:** the parse and contrast rules use the `mermaid` package at exactly `11.17.2`, and `@mermaid-js/parser`, both installed with this package. The pin holds sequence diagram colours, which change between mermaid releases.
- **Your host's mermaid may differ.** GitHub and other hosts draw diagrams with their own mermaid version. A diagram type newer than the host's may parse here and still fail to draw there.

`npm ls mermaid` in your project prints the mermaid version a run uses.
[Reference](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/#requirements-and-compatibility) lists which parser reads each diagram type.

## Configure and extend

- [Configure the rules](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/configure/): switch a rule off, change the complexity preset, set options.
- [Lint a MkDocs Material site](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/mkdocs/): score diagrams the way the theme renders them.
- [Write a local rule](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/local-rule/) or [publish a plugin package](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/plugin-package/): add rules of your own, which load with no config.
- [Troubleshooting](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/troubleshooting/): a README that fails after adding `mkdocs.yml`, skipping a diagram, and other common questions.

## Use it from an AI agent

[`skills/mermaidjs-lint/`](skills/mermaidjs-lint/SKILL.md) is an agent skill that runs the linter, applies the safe fixes, then fixes what remains by judgement.
It is not in the npm package, so copy it from this repository.
The skill is the one file `SKILL.md`.
Its `evals/` folder holds deliberately failing fixtures for this repository's own tests, so never copy it.
For Claude Code, run these in your project:

```sh
mkdir -p .claude/skills/mermaidjs-lint
curl -fsSL https://raw.githubusercontent.com/jpeakai/jpai-mermaidjs-lint/main/skills/mermaidjs-lint/SKILL.md \
  -o .claude/skills/mermaidjs-lint/SKILL.md
```

Use `~/.claude/skills/mermaidjs-lint` instead to use it in every project.
Another agent can follow `SKILL.md` as plain instructions.
[Agent evals](https://jpeakai.github.io/jpai-mermaidjs-lint/gallery/agent-evals/) shows how well agents fixed the failing fixtures it lists, and which skill revision they used.

## Library use

```ts
import { checkMarkdown, fixSource } from "@jpeakai/mermaidjs-lint";

const findings = await checkMarkdown(src, "README.md");
const fixed = await fixSource(src, "README.md");
```

These calls run the built-in rules only, and read no config file and no plugin.
The [Library API](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/library-api/) page lists every export, and shows how to run with the config and plugins as the command does.

## Versioning

The package follows semantic versioning, and while it is at `0.x` a minor release may break the public surface.
[Versioning](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/#versioning) lists what that surface is.
[CHANGELOG.md](CHANGELOG.md) lists what changed in each release, and what is on `main` but not yet released.

## Security

A plugin is code that runs on your machine, and plugins load on their own once a project depends on them.
[SECURITY.md](SECURITY.md) covers the supported versions, the trust model and how to report a vulnerability privately.

## Support

Report a bug or ask a question in [GitHub issues](https://github.com/jpeakai/jpai-mermaidjs-lint/issues).
A bug report needs:

- The version, from `mermaidjs-lint --version`, or from `npm ls @jpeakai/mermaidjs-lint` on 0.1.1 and earlier.
- The command you ran.
- The diagram, or the smallest file that shows the problem.
- The output of the same command with `--json`.

## Origin

The checks port an earlier set of diagram-checking scripts, which measured complexity and contrast for Mermaid diagrams.
The package shape, the plugin mechanism and the fix verification follow [jpai-prose-gates](https://github.com/jpeakai/jpai-prose-gates).
The reasoning behind each choice is recorded in [`adrs/`](adrs/index.md).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and how a change is accepted.

## Licence

MIT, as stated in [LICENSE](LICENSE).
