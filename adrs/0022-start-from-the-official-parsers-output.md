---
type: Architecture Decision
title: Every feature starts from the official parsers' output, and no parsing logic is reinvented
description: Diagrams are read through mermaid's parsers and markdown through mdast, never a custom parser
tags: [parsing, architecture]
status: accepted
accepted_on: 2026-10-18
provenance: Split plans needed shapes, edge labels and arrow kinds, all of which mermaid's parser results already hold. The maintainer ruled that no feature may parse diagram text itself
enforced_in:
  - src/parse/stats.ts and src/parse/graph.ts, the only modules that read mermaid's parser results
  - src/model.ts, which reads markdown only through mdast-util-from-markdown
  - review of every change, which refuses a regex, tokeniser or scan over diagram or markdown text that derives structure
generated: { by: jpai-mermaidjs-lint, at: 2026-10-18T00:00:00Z }
---

<!-- GENERATED from MJL-0022 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0001](0001-parse-with-mermaids-own-parsers.md) (MJL-0001 covers counting, and this record covers every feature, emitted text and every other dependency)
- See also [MJL-0023](0023-markdown-is-read-only-through-mdast.md) (the same rule for markdown and every other dependency)
- See also [MJL-0025](0025-a-fold-is-offered-as-a-split.md) (a split plan reads the parser's graph and parses its emitted text again)
- See also [MJL-0027](0027-gaps-in-the-official-parsers-are-recorded.md) (the places the official parsers' output falls short, each with its pinned workaround)

## Decision

### The lens

#### Given

a feature needs something a diagram or a document says.
That may be a node, an edge label, a shape, an arrow, a block or a fence

#### We prefer

starting from the result of the canonical parsers, which are mermaid core, @mermaid-js/parser and mdast.
That is preferred over writing a parser, a tokeniser or a regex over the text, and over rebuilding anything an installed dependency already provides

#### Because

the official parsers implement the grammar the renderer draws, so a reimplementation can only drift from it.
A second parser also doubles the code to test and maintain

#### Unless

never.
Text a feature emits is checked by parsing it again with the same parsers, never by scanning it

## Consequences

### Pros

- Every structure a rule or a split plan reads is the one mermaid draws.
- A new mermaid release that changes the grammar changes this package's reading with it.

### Cons

- A fact the parser result does not expose cannot be used until mermaid exposes it.
- Some parser results are internal shapes, which a mermaid upgrade may change and the tests must catch.
