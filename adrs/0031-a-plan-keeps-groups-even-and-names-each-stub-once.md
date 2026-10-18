---
type: Architecture Decision
title: A plan lands near its target, keeps groups even and to one family, and names each stub once
description: How a split plan balances its groups, keeps them to one family and tells stubs apart
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: A blind paired rating of 24 plans gave a mean of 3.79 out of 5, every plan correct. The plans rated 3 or lower shared five faults. A compiler's class diagram got a four-node overview, below the 60% share an overview keeps once evened, because a greedy walk folded a small namespace first and then needed a larger one. An e-commerce model folded twelve of its twenty-two entities into one aggregate, after that aggregate had already swallowed another one over the target. A Jira epic graph grouped PLAT- tickets with SEC- tickets and REL- tickets with MOB- tickets, declaring 18 new reachable pairs. A SaaS billing overview drew five parallel edges between two aggregates when a fold nearly as good drew none. A detail drew the same stub text, "Checkout domain (+5)", three times
enforced_in:
  - src/split/plan.ts loosen, which undoes a group when a walk leaves the overview below evenFloorOf and the target still holds, leaving T2 groups alone
  - src/split/tier4.ts, which held to no target offers every owner's aggregate but never one swallowing a group already over the target
  - src/split/stem.ts stageOf and mixesFamilies, src/split/tier.ts keepsFamilies, and src/split/rules.ts keepFamilies, which keep a T5 or T6 group to one prefix family under the strict rules
  - src/split/tier6.ts and src/split/plan.ts better, which rank a pair within one family before any other
  - src/split/plan.ts nearest, which takes the fold nearly as good leaving the fewest parallel overview edges in T4, T5 and T6
  - src/split/label.ts namedStubs and FROM, and src/split/assemble.ts viewOf, which name each whole-group stub drawn apart by its member, or draw one stub
  - src/split/contract.ts stubNames, which reads the FROM form and checks the member named draws every edge its stub draws
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0031 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) (stubs drawn apart for one group are told apart by the member each one's edges leave)
- Scoped exception to [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) (a pair across two prefix families is never proposed under the strict rules, and a pair within one goes first, not only on a tie)
- Scoped exception to [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) (held to no target, any owner's aggregate may fold, not only a root's, and never one swallowing a group already over the target)

## Decision

### The lens

#### Given

a reader of an overview counts its nodes against the target, compares its groups' sizes, reads a group's name as a promise about its members and follows parallel lines as separate relationships. A detail's stubs are read by their text alone

#### We prefer

undoing, when a walk leaves the overview below 60% of node_target rounded up, the group whose undoing gives back the most nodes while the overview and every detail that fitted still meet their targets. A T2 group stays, since it is one run of a pattern folded evenly. An erDiagram aggregate folded over the target is never folded again into its owner's aggregate. Held to no target, any owner's aggregate may fold, not only a root's. A T5 or T6 group never holds members of two prefix families under the strict rules. A prefix family is the dotted prefix leading a label, such as bronze., else the letters leading an id-led label, such as PLAT- in PLAT-1201, else letters and an underscore leading an id, such as br_. In T6, a pair within one family ranks before any other pair, then by modularity gain. When the target cannot be met so, the plan is walked again with families mixed, before hubs and branches are folded. In T4, T5 and T6, of the candidates within 5% of the best saving per node hidden, or in T6 of the best gain and of the same kin, the one leaving the fewest parallel overview edges is taken. A parallel edge is an overview edge beside another between the same two nodes, at least one a group. Stubs for one whole group drawn apart in one detail, which would show one text, each take " from " and the label of the one member their edges leave, as "Checkout domain (+5) from paymentservice". So does a whole-group stub beside a stub for the member its group is named after, as "10007 QA (+2)" beside "10007 QA (in group)". The text must have exactly one reading, the group, and the member must draw every edge the stub draws. When any stub cannot be named so, the detail draws one stub for the group

#### Because

a four-node overview of a twenty-two node diagram hides more than the target asks. A group holding half a diagram is a second diagram to read, not a summary. Ticket keys, table namespaces and id prefixes are the author's own grouping, so a group mixing two reads as wrong whatever its modularity. Five lines between two boxes read as noise when another fold saving as much draws none. Three stubs with one text read as a duplicate, while naming each member shows three sources

#### Unless

a diagram meets its target only with families mixed, with an uncapped aggregate inside another, or with a stub text that reads two ways. The plan then falls back in that order, as before

## Consequences

### Pros

- The compiler AST overview keeps six nodes at low density, and the Jira epic graph groups each ticket family apart with no new reachable pair.
- The SaaS billing overview draws no parallel edges and declares no loss.
- A detail never shows two stubs with one text.

### Cons

- A plan near the cap of node_target can result where a smaller overview was offered before.
- A family read from an id prefix can be wrong, and under the strict rules it now forbids a merge rather than breaking a tie.
- A stub's text grows by its member's label.
