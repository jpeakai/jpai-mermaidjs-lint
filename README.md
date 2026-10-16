# mermaidjs-lint

Catch Mermaid diagrams in your markdown that fail to parse, turn unreadable in light or dark themes, or grow too big to follow.

**[Docs](https://jpeakai.github.io/jpai-mermaidjs-lint/)** | **[Rules](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/rules/)** | **[Changelog](CHANGELOG.md)** | **[npm](https://www.npmjs.com/package/@jpeakai/mermaidjs-lint)**

## Lint your docs with one command

```sh
npx -y @jpeakai/mermaidjs-lint docs/
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

## Four tenets define the tool

Three tenets are guarantees about every diagram the tool passes, and the fourth is a commitment about the tool.

- **Readable in light and dark.** Declared fills, label colours and borders are scored as the host draws them, on nodes, erDiagram rows, edge labels and sequence diagrams, in both themes.
- **Renders.** Every diagram parses with the mermaid parsers this package ships, and every mermaid fence is closed.
- **Simple enough to follow.** Node count and visual complexity are scored against a density preset, so an oversized diagram is flagged to be split.
- **Extensible.** A plugin adds rules of your own, which run through the same config, fix engine and verification as the built-ins.

## Go further in the docs site

- [Get started](https://jpeakai.github.io/jpai-mermaidjs-lint/get-started/): run it, fix a diagram, and add the gate to your project.
- [Gate diagrams in CI](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/ci/) or [before each commit](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/pre-commit/).
- [Configure the rules](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/configure/), or [write a local rule](https://jpeakai.github.io/jpai-mermaidjs-lint/guides/local-rule/).

## Use it from an AI agent

The agent skill in [`skills/mermaidjs-lint/SKILL.md`](skills/mermaidjs-lint/SKILL.md) runs the tool, applies the safe fixes, and fixes the rest by judgement.
Copy it into a Claude Code project:

```sh
curl -fsSL --create-dirs -o .claude/skills/mermaidjs-lint/SKILL.md \
  https://raw.githubusercontent.com/jpeakai/jpai-mermaidjs-lint/main/skills/mermaidjs-lint/SKILL.md
```

## Runs on Bun or Node

It needs Bun, or Node `>=20`.
The package installs mermaid `11.17.2` to parse diagrams, and your host may draw with another version.

## Contribute

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup.
Licensed under [MIT](LICENSE).
