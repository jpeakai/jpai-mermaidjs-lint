---
type: Architecture Decision
title: Colour parsing and WCAG contrast come only from colorjs.io
description: No hand-written colour parser, luminance formula or contrast ratio
tags: [contrast, dependencies]
status: accepted
accepted_on: 2026-10-18
provenance: The contrast rules already compute WCAG 2.1 ratios and APCA through colorjs.io. The maintainer made that binding, so no feature may reimplement colour maths
enforced_in:
  - src/parse/color.ts, whose wcagRatio, apcaLc and alphaOf call colorjs.io
  - review of every change, which refuses a hand-written colour parser, relative luminance formula or contrast ratio
generated: { by: jpai-mermaidjs-lint, at: 2026-10-18T00:00:00Z }
---

<!-- GENERATED from MJL-0024 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [MJL-0023](0023-markdown-is-read-only-through-mdast.md) (the same rule for markdown and every other dependency)
- See also [MJL-0017](0017-sequence-colours-come-from-mermaids-theme-engine.md) (sequence colours come from mermaid's theme engine, and their contrast from colorjs.io)

## Decision

### The lens

#### Given

a rule needs to read a colour, blend a translucent fill, or score contrast against WCAG or APCA

#### We prefer

calling colorjs.io for the parse, the colour space conversion and the contrast ratio.
That is preferred over writing our own colour parser, luminance formula or ratio

#### Because

colorjs.io reads every CSS Color Level 4 syntax and implements the published WCAG 2.1 and APCA algorithms.
A copy of that maths can only drift from it

#### Unless

never

## Consequences

### Pros

- A ratio the linter reports matches the WCAG 2.1 definition, for every colour syntax a browser reads.

### Cons

- The contrast rules depend on colorjs.io's release cadence for any change to a contrast algorithm.
