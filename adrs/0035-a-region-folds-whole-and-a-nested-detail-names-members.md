---
type: Architecture Decision
title: An author region folds whole however much of a diagram it holds, a pipeline folds by lane, and a detail split again names the members it reaches
description: How outsized regions, pipeline lanes and the stubs between two groups joined both ways are drawn
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: Three blind raters scored 24 paired plans at a mean of 3.99 out of 5, every plan correct. A compiler's Ast namespace, folded as its parts since MJL-0034, scored 2.67 where the whole namespace with its nested split had scored 4. Raters read the parts as misleadingly named inheritance groups with 4 new reachable pairs, against 2 for the whole namespace. An e-commerce schema's nested ORDER detail drew the whole CUSTOMER group where an earlier plan named PAYMENT_METHOD (CUSTOMER), and all three raters marked it down for that. An ETL pipeline folded by layer since MJL-0034 cut each layer into arbitrary halves, read as stub-heavy, where a plan folding each extract with its bronze table read as a source-to-consumer story
enforced_in:
  - src/split/plan.ts planWork, which walks every diagram with its author regions folded whole
  - src/split/tier2.ts proposeChains, which folds a chain stage across prefix families
  - src/split/assemble.ts splitAgain and src/split/quotient.ts exactSide, which let the group whose detail is split again draw the other's members
  - tests/split/round13.test.ts, which holds the three rated diagrams to these plans
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0035 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0034](0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md) (a region holding most of a diagram folds whole, its detail split again, not as its parts first)
- Scoped exception to [MJL-0034](0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md) (a chain stage may join prefix families, so an extract folds with the bronze table it lands in)
- Extends [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (of two groups joined both ways, the one whose detail is split again draws the other's members)
- Extends [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) (an author region folds whole however much of a diagram it holds)

## Decision

### The lens

#### Given

a reader of a split plan reads an author's namespace as the diagram's own story, and follows a stub to the node it names. A stub in a nested overview standing for a whole group sends the reader two levels back without saying which member it reaches. A pipeline's lanes carry each source to the table it lands in

#### We prefer

folding an author region whole however much of a diagram it holds, its detail split again when it does not fit. A chain stage may join two prefix families, so each extract folds with the bronze table it lands in, and lanes alike fold as twins. Edges may join two groups both ways, and one group's detail may exceed the target and be split again while the other's fits. The group split again then draws every edge between them exactly, with stubs for the other's members. Otherwise the group needing stubs for fewer of the other's members draws them, as before. The other group's detail draws it whole, and still no detail draws a group whole beside a stub for one of its members

#### Because

raters preferred the whole namespace with its nested split to its parts, which read as tangled and lost more. A member stub in a nested overview names where the reader goes. A whole-group stub in a flat detail names a group the top overview already draws. Lanes read as sources flowing into their tables, where halves of a layer read as arbitrary cuts

#### Unless

two groups joined both ways may both, or neither, have details split again. A diagram may have no chain across prefix families, or no region holding most of it. The plan then stands as before

## Consequences

### Pros

- The compiler plan folds Ast whole with its nested split and 2 new reachable pairs.
- The e-commerce plan's nested ORDER detail names PAYMENT_METHOD (CUSTOMER) and CUSTOMER (in group).
- The ETL pipeline folds two groups of lanes, each extract beside its bronze table, with no new reachable pair.

### Cons

- The compiler plan's top overview reads as the Ast group beside a few small ones.
- The flat CUSTOMER detail draws ORDER (+6) whole for the payment it uses, not the PAYMENT member.
- A group of lanes is named after its first extract, though it also holds bronze tables.
