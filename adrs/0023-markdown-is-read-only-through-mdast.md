---
type: Architecture Decision
title: Markdown is read only through mdast, and reimplementing a dependency is non-compliance
description: No custom markdown parser, and code that duplicates an installed dependency is refactored onto it
tags: [parsing, architecture, dependencies]
status: accepted
accepted_on: 2026-10-18
provenance: The maintainer ruled that the package must rely on the libraries it already depends on, and that duplicating one is a defect to refactor
enforced_in:
  - src/model.ts, which builds the document from mdast-util-from-markdown with its gfm and frontmatter extensions
  - review of every change, which refuses a regex or scan over markdown text that finds fences, headings or other structure
generated: { by: jpai-mermaidjs-lint, at: 2026-10-18T00:00:00Z }
---

<!-- GENERATED from MJL-0023 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0009](0009-a-diagram-is-read-from-the-markdown-tree.md) (a diagram is read from the markdown tree, and that tree comes only from mdast)
- See also [MJL-0022](0022-start-from-the-official-parsers-output.md) (the same rule for diagram text and mermaid's parsers)
- See also [MJL-0024](0024-colour-and-contrast-come-from-colorjs.md) (the same rule for colour parsing and contrast)
- Extended by [MJL-0027](0027-gaps-in-the-official-parsers-are-recorded.md) (the recorded gaps in mermaid, each with the one narrow workaround allowed)

## Decision

### The lens

#### Given

a feature needs a markdown structure, such as a fence, its language, its position, a heading or frontmatter.
Or it needs something an installed dependency already provides

#### We prefer

reading markdown only from the mdast tree, and calling the dependency that already does the job.
That is preferred over a custom markdown parser, and over reimplementing any part of a library this package depends on

#### Because

the dependency is already tested, maintained and shipped, so a second version only adds code that can drift from it.
Duplicated logic is treated as non-compliance and refactored onto the dependency

#### Unless

never.
When a dependency lacks a feature, the gap is recorded and solved with another maintained library, not a hand-written parser

## Consequences

### Pros

- Every fence and position the linter reports is the one CommonMark and GFM define.
- Less code to test, and fixes upstream arrive with an upgrade.

### Cons

- A behaviour the dependency gets wrong must be fixed upstream or worked around in its output, never by parsing the text again.
