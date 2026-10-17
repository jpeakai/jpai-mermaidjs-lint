# mermaidjs-lint

| **[Docs](https://jpeakai.github.io/jpai-mermaidjs-lint/)** | **[Rules](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/)** | **[Changelog](CHANGELOG.md)** | **[npm](https://www.npmjs.com/package/@jpeakai/mermaidjs-lint)** |

I hate walls of text. I do _**love**_ a good diagram though. mermaidjs is brilliant for separating the _**semantic structure**_ of a diagram from _**the pixel pushing**_.

AI Agents love this separation too. And yet AI Agents kind of suck at diagrams though. So here is a linting and autofixer engine built on top of:
- [`mermaid`](https://www.npmjs.com/package/mermaid) parsing libraries
- [`colorjs.io`](https://www.npmjs.com/package/colorjs.io) for official [WCAG 2.1](https://colorjs.io/docs/contrast#wcag-21) colour contrast readability scoring.

## Lint your docs with one command

```sh
# bunx
bunx @jpeakai/mermaidjs-lint docs/
bunx @jpeakai/mermaidjs-lint --fix docs/

# npx
npx -y @jpeakai/mermaidjs-lint docs/
npx -y @jpeakai/mermaidjs-lint --fix docs/
```

```text
docs/architecture.md:6 contrast-text-below-aa classDef warn: text 1.43:1 < 4.5 (#ffffff on #ffd400)
docs/login.md:3-7 parse-diagram-unparseable sequenceDiagram did not parse (parser: mermaid-core) (its line numbers count within the diagram, not the file): Parse error on line 3: Expecting 'TXT', got 'NEWLINE'
docs/pipeline.md:3-41 complexity-node-count-acceptable-exceeded 37 nodes > 35 acceptable threshold
3 finding(s) in 3 file(s)
```

The run exits 1 while any finding remains, so it works as a CI gate.

## Fix unreadable label text and unclosed fences

Add `--fix` to apply the fixes that pass verification:

```diff
-  classDef warn fill:#ffd400,color:#ffffff
+  classDef warn fill:#ffd400,color:#000000
```

A fix is kept only if the markdown around the diagrams is unchanged and each diagram reparses with the same node ids, subgraphs and counts.
Edge endpoints, edge labels and node text are not compared, so review the diff.

## Four tenets

- **Always readable in light mode or dark mode.** Declared fills, label colours and borders are scored as the host draws them, on nodes, erDiagram rows, edge labels and sequence diagrams, in both themes.
- **It actually renders a valid diagram.** Every diagram parses with the mermaid parsers this package ships, and every mermaid fence is closed.
- **Visual Complexity stays readable.** Node count and visual complexity are scored against a density preset, so an oversized diagram is flagged to be split.
- **Make your own rules.** A plugin adds rules of your own, which run through the same config, fix engine and verification as the built-ins.

## Go further in the docs site

- [Get started](https://jpeakai.github.io/jpai-mermaidjs-lint/get-started/): run it, fix a diagram, and add the gate to your project.
- [Use it in CI](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/ci/) or [before each commit](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/pre-commit/).
- [Configure the rules](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/configure/)
- [Write a project local rule](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/local-rule/).

## Runs on Bun or Node

It needs Bun, or Node `>=20`.
The package installs mermaid `11.17.2` to parse diagrams, and your host may draw with another version.

## Contribute

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup.
Licensed under [MIT](LICENSE).
