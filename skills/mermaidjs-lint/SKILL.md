---
name: mermaidjs-lint
description: "Lint and fix Mermaid diagrams in markdown or .mmd files with @jpeakai/mermaidjs-lint: syntax that does not parse, diagrams too large or too deeply nested to read, and label or border colours below WCAG contrast. Use when a diagram fails the linter, when asked to check or fix a Mermaid diagram, or before declaring a diagram done. Runs through bunx or npx, so it needs network access to the npm registry the first time."
argument-hint: "[markdown-file]"
user-invocable: true
---

# Lint and fix Mermaid diagrams

The linter reads every ` ```mermaid ` fence in a markdown file, or a whole `.mmd` or `.mermaid` file.
It prints each finding with its file, line, rule and message, and `--json` adds a remediation.
A file is done when the linter reports **0 findings** and every node and edge the author drew is still there.

## 1. Run the linter

```sh
bunx @jpeakai/mermaidjs-lint <file>
# without Bun
npx -y @jpeakai/mermaidjs-lint <file>
```

It exits `0` with no findings, `1` when findings remain, and `2` on a usage error.
Add `--json` for machine-readable findings, each with its `remediation`.
A directory is walked for markdown, `.mmd` and `.mermaid` files.

## 2. Apply the safe fixes

```sh
bunx @jpeakai/mermaidjs-lint --fix <file>
```

`--fix` writes only the fixes it can prove safe, then reports what remains.
A fixer that is unsure leaves the text alone, so expect findings to survive it.

## 3. Fix what remains by judgement

List what remains with its remediation, which only `--json` prints:

```sh
bunx @jpeakai/mermaidjs-lint --json <file>
```

Edit the file in place. Read each finding's `rule` and `remediation`, then:

| Rule | Fix |
|------|-----|
| `parse-diagram-unparseable` | Repair the syntax with the smallest change that parses: complete a dangling edge, close a bracket, quote a label. |
| `contrast-text-below-aa` | Declare a `color:` that reads at **4.5:1 or better** against the `fill:`. Light text on a dark fill, dark text on a light fill. |
| `contrast-directive-unauditable` | A `fill:` with no `color:` cannot be audited. Declare the label colour beside the fill, clearing 4.5:1. |
| `contrast-border-below-ui-minimum` | Set a `stroke:` that reads at **3:1 or better** against the fill. |
| `complexity-node-count-*`, `complexity-visual-score-*` | Split the diagram into an overview plus one diagram per part, along its named subgraphs or natural stages. |
| `complexity-subgraph-nesting-too-deep` | Merge a level of nesting so subgraphs are at most two deep. |

Two cases need more care:

- **`erDiagram` entities.** An entity draws its attribute rows on both light and dark backgrounds, so no single label colour reads on every row. Drop the `fill:` and `color:` and mark the entity with a `stroke:` instead.
- **Splitting a diagram.** Every original node id must appear in at least one of the new diagrams. Every edge survives too, inside a part or as an edge between parts in the overview.

## 4. Re-run until clean

Run step 1 again after every edit and repeat until it reports 0 findings.

## Rules for every fix

- **Keep every node and edge.** Deleting a diagram, a node or an edge to silence a finding is not a fix.
- **Edit in place.** Do not write a second copy of the file or add new files beside it.
- **Keep the prose.** Headings and text around the diagram stay as they were.
- `bunx @jpeakai/mermaidjs-lint --list-rules` prints every active rule, and `--help` the full CLI.
