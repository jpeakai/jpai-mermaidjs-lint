---
type: Architecture Decision
title: A stub for a range's first or last member shows its own label
description: How a stub names a member a range label names
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-20
provenance: Six blind raters scored 24 paired plans at a mean of 4.11 out of 5, every plan correct and every plan at 4 or more. A plan for ticket ids drew "REL-0042 (in REL-0042 … REL-0044 (+1))" in four details, the range already naming REL-0042. A later round tried three changes at once, and six blind raters scored it at a mean of 4.10, a tie. The ticket-id plan, its range ends shown by their own label, rose from 4.00 to 4.17. Opening a loan flow's oversized decision region gained nothing at any preset, and hid its senior sign-off at the high preset. Span labels up to 80 characters gained nothing on a release pipeline. An incident flow fell from 4.83 to 4.00 once a second long span label named one of its groups. So only the stub change is kept
enforced_in:
  - src/split/label.ts ownSuffices and rangeEnds, which let a stub for a member a range label names show its own label
  - tests/split/round19.test.ts, which holds the ticket-id plan to these stubs and the rated loan and incident flows to their earlier plans
generated: { by: jpai-mermaidjs-lint, at: 2026-10-21T00:00:00Z }
---

<!-- GENERATED from MJL-0041 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0039](0039-rows-alone-fold-nothing-and-a-plan-says-why-it-was-flagged.md) (a stub for a range label's first or last member shows its own label)

## Decision

### The lens

#### Given

a stub's text names the outside node it stands for.
A range label already names its first and last members

#### We prefer

a stub for the first or the last member a range label names shows its own label alone, as "REL-0042".
It does so only when the group shows its range uncut, and neither the member nor the group holds markup

#### Because

a stub repeating the range that names it says the same name twice.
The reader finds the member's own label in the overview, at one end of the range

#### Unless

the group shows its range cut, or a label holds markup.
A member of a range group that the range does not name keeps its group's label in its stub

## Consequences

### Pros

- The ticket-id plan's stubs read "REL-0042" and "PLAT-1240", where they read the member and then its range.

### Cons

- A stub for a range end no longer says which group holds it, so the reader finds that group by the range.
