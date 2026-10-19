---
type: Architecture Decision
title: A pipeline stage folds across its lanes, a status stem names a family, and a stub draws each edge once
description: How a split plan groups a stage no edge joins, reads a family from id-led statuses, and draws edges from a whole group
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: A blind paired rating of 24 plans gave a mean of 3.88 out of 5, every plan correct. An ETL pipeline's silver and gold tables, each fed by one shared node and joined to no table of their own stage, could not form a stage-pure group, so the plan mixed extract, bronze and gold in one group. A Jira workflow named by status ids got a Code Review group holding Released and Hotfix, since no label carried a prefix family. A loan detail drew "Debt-to-income under 40%? (+5) from Debt-to-income under 40%?" beside a second stub for the same group, and a GitOps detail drew one stub edge into repo-server three times
enforced_in:
  - src/split/quotient.ts detailView, which draws an edge from a whole group into a member once for every edge drawing alike
  - src/split/assemble.ts viewOf and src/split/label.ts namedStubs, which name a whole-group stub by the member its edges leave only beside a stub for its namesake member, and never by the namesake
  - src/split/contract.ts checkRecoverable, which reads half edges as a set and refuses one drawn twice
  - src/split/tier6.ts stagePairs, which offers two overview nodes of one prefix family whose members share an original neighbour
  - src/split/contract.ts joined, which refuses a T6 group its members do not connect
  - src/split/stem.ts statusFamilies and src/split/tier.ts familyOf, which read a status family from labels leading with a bare id
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0032 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) (edges from one group drawing alike are drawn once from one stub, not from a stub each)
- Scoped exception to [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (stubs for one group are never drawn apart, so only a stub beside its namesake member is named by a member)
- Extends [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (a family is also read from a status stem, and a pair of one family may share a neighbour)
- Extended by [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (in a ticket graph a whole id family folds before any pair, hubs included)

## Decision

### The lens

#### Given

a reader of a detail reads each stub as one outside thing and each line as one relationship. A pipeline's stage is the set of tables one step produces, and they rarely feed each other. A workflow named by status ids carries its stages only in the status words

#### We prefer

drawing an edge from a whole group into a member once. It stands for every edge from that group into the member with one label, kind and cardinality. The source group's own detail draws each of those edges to the exact member, so every original edge still reads back exactly once. The contract, the reading and the checker read such half edges as a set, and a half drawn twice is refused. A whole-group stub may sit beside a stub for the member its group is named after. It still takes " from " and the one member its edges leave. It takes none when that member is the namesake, which the group's label already names. In T6, two overview nodes no edge joins are offered as a pair when members of each share an original neighbour. Such a pair is taken only when it names one prefix family. So it ranks with the other pairs of one family, before any other pair. A T6 group must be connected. Two members are joined by an edge between them, or by an author region the group folds whole. They are also joined by a neighbour they share, when both name one prefix family or both are leaves. A label leading with a bare id and naming no prefix family takes a status family. That is the one stem a word after its id shares with another such label, as "releas" in "10008 Ready for Release" and "10009 Released". A label sharing no stem, or two, takes none

#### Because

one stub drawn per member, or one stub drawn three times, reads as three sources or a duplicate where the overview draws one edge. The tables of one pipeline stage belong together however few edges join them, and a shared neighbour is the structure that says so. Requiring a shared neighbour and one family keeps every suggested group connected, so a group never gathers unrelated nodes. Two statuses sharing a stem name one stage of a workflow, and a status sharing none says nothing a family could use

#### Unless

a diagram meets its target only with families mixed, when the plan falls back as MJL-0031 says. A detail still draws two edges from one stub when their labels or kinds differ

## Consequences

### Pros

- The ETL pipeline folds its five gold tables into one group and declares no new reachable pair.
- The Jira workflow keeps Ready for Release and Released together, apart from Code Review.
- No detail draws a stub edge twice or two stubs for one group, so the " from " form is rarer.

### Cons

- A target detail no longer shows how many members of the source group lead to a member, only that the group does.
- A family read from an id prefix or a stem can still be wrong, and now it can join two nodes no edge joins.
- The contract refuses a suggested group joined only through a node of another family, which no tier made before.
