# Changelog

Every change a user of `@jpeakai/mermaidjs-lint` can see, by release.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [semantic versioning](https://semver.org/).
While the package is at `0.x`, a minor release may break the public surface that [Versioning](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/#versioning) lists.

The docs site describes the latest release, because it is published when a release is.
The README on GitHub describes the `main` branch.
Anything under `Unreleased` is on `main` but not yet released.

## [Unreleased]

Nothing yet.

## [0.16.0] - 2026-10-21

### Changed

- **A stub for a range's end shows its own label.** A stub for the first or the last member a range label names reads `REL-0042`, where it read `REL-0042 (in REL-0042 … REL-0044 (+1))`, per [MJL-0041](adrs/0041-a-stub-for-a-range-end-shows-its-own-label.md).
- **Twin chains in a detail split again fold in runs of lanes.** Lanes too many for one detail fold by the word their labels lead with, when each such set fits.
  Else they fold in label order, cut evenly, per [MJL-0042](adrs/0042-twin-chains-in-a-nested-detail-fold-in-runs-of-lanes.md).
  So an ETL pipeline's `Extract/Ingest → bronze (+14)` detail reads `Extract → bronze (+8)` and `Extract/Ingest → bronze (+6)` at `low-density`, where it read seven groups of one lane each.

## [0.15.0] - 2026-10-20

### Changed

- **A diagram over its target only for its rows folds only its closed aggregates.** Once the overview meets the target with rows dropped, an `erDiagram` folds only aggregates one entity holds every outside relationship of, per [MJL-0040](adrs/0040-closed-aggregates-fold-at-rows-dropped-and-leaves-are-listed.md).
  So a university schema folds `ROOM (+BUILDING)` and `ENROLMENT (+GRADE)` and keeps ASSESSMENT in view, where it folded it into `SECTION (+ASSESSMENT)`.
  Any other diagram stops at `T1`, rows dropped, and folds nothing, per [MJL-0039](adrs/0039-rows-alone-fold-nothing-and-a-plan-says-why-it-was-flagged.md).
- **A plan says why it was offered.** Each plan carries `flagged`: the size the complexity rules measured, the split target and which measure is over.
  `--split-plan` prints it under the heading.
  A plan at `T1` adds that its rows move to row diagrams and no node folds.
  A plan folding closed aggregates says only those fold.
- **A group of three names every member.** `ADDRESS (+CITY, COUNTRY)` replaces `ADDRESS (+2)`, the others in natural order, and a stub for any member shows its own label alone.
  A group a range, family or lane label names keeps that label.
- **A group of leaves names every member.** A boutique's external APIs read `Carrier quote API (+ECB rates feed, Payment provider API, SMTP relay)`, where they read `Checkout domain → … (+4)`.
  The list holds 80 characters at most, else the group keeps its fan label.
- **A flowchart run is named by where its flow enters and leaves.** A group entered at one member and left from another reads `git push to main → tsc --noEmit (+4)`, where it read `git push to main (+5)`.
  A stub for either end shows its own label alone.

## [0.14.0] - 2026-10-20

### Changed

- **Twin chains fold whole.** A pipeline's lanes fold into one group, never cut into runs by label order, per [MJL-0038](adrs/0038-twin-chains-fold-whole-and-a-pair-names-both-members.md).
  When their detail does not fit, it is split again, and each lane folds as one group in it.
  A lane's place may be named by two first words, so an ETL pipeline's lanes read `Extract/Ingest → bronze (+14)`.
- **A group of two names both members.** `ROOM (+BUILDING)` replaces `ROOM (+1)`, so a tangled schema's folded aggregates hide no entity's name.
  A stub for either member shows its own label alone, as `CART` where it read `CART (in CART (+1))`.
  So does a stub for the member any group is named after, as `Fraud model flags?` where it read `Fraud model flags? (in Fraud model flags? (+4))`.
  Groups of two folded alike take it only when every one of them can.
- **A group of leaves is named by the node they hang from.** A boutique's external APIs read `Checkout domain → … (+4)`, where they read `Carrier quote API (+3)`.
- **A target split again draws the edges joining two groups one way.** So a pipeline's scheduler detail draws the lanes as one stub.

## [0.13.0] - 2026-10-20

### Changed

- **Stubs for one group's members share a box.** A flowchart detail draws its stubs for two or more members of one group inside one subgraph showing that group's label.
  Each stub inside shows its member's own label, per [MJL-0037](adrs/0037-stubs-for-one-group-share-a-box-and-the-lighter-detail-draws-exactly.md).
  A group folding one author region whole is boxed as that region, so an edge to the region meets the box.
  A detail draws a box only while it still meets the target.
  The contract reads each box and each stub inside it with exactly one reading.
- **The lighter detail draws edges joining two groups one way.** The target draws them when it needs stubs for fewer of the source's members.
  With as many, it draws them when it meets fewer outside nodes, while it still meets the target.
  So a streaming platform's Edge tier detail draws five stubs where it drew seven, and a boutique's Checkout detail draws six where it drew nine.
- **A leaf fold saving alike keeps groups even.** Of two `T5` folds saving as much, the one leaving the smaller largest group goes first.
  So a compiler's nested Ast overview keeps `Node` in view and names `Expression (+3)`, where it named `Node (+4)`.

## [0.12.0] - 2026-10-20

### Changed

- **A group is named by what all its members share.** A group holding a whole dotted family reads `gold.* (+5)`, and twin chains read by their stages, as `Extract → bronze (+8)`, per [MJL-0036](adrs/0036-a-group-is-named-by-its-family-or-lanes-and-a-stub-by-its-group.md).
  Both count every member, and the contract accepts them only as recomputed from the members.
- **A stub for a member of a group names the group as the overview shows it.** `PAYMENT_METHOD (in CUSTOMER (+2))` replaces `PAYMENT_METHOD (CUSTOMER)`, and `CUSTOMER (in CUSTOMER (+2))` replaces `CUSTOMER (in group)`.
- **One member's edges into another group draw in the target's detail.** Edges may run one way from a single member into several members of another group.
  They now come in from one stub for that member, and the source's detail draws the target as one stub.
  So a pipeline's scheduler detail draws three stubs where it drew eight.

### Fixed

- A split plan parses each candidate diagram once, not once per measurement, so a complexity finding with a plan is reported about twice as fast.

## [0.11.0] - 2026-10-19

### Added

- **A refused star or dense mesh prints the list or table that reads better.** `--split-plan` prints a star's hub and every leaf as a markdown list, and a dense mesh as a markdown adjacency matrix, per [MJL-0034](adrs/0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md).
  Both are built from the parsed graph and draw every node and edge, each edge's way, label and connector.
  The complexity finding's remediation points to it, and `SplitOutcome` gains `alternative`, with the library exporting its `SplitAlternative` type.

### Changed

- **A pipeline folds by lane.** A chain stage may join prefix families, so each extract folds with the bronze table it lands in. Lanes alike fold as twins, per [MJL-0035](adrs/0035-a-region-folds-whole-and-a-nested-detail-names-members.md).
  With hubs folded, prefix families such as `bronze.` and `silver.` stay apart before a walk mixes them.
  A pair of one family sharing more overview neighbours folds first.
- **An aggregate draws no relationship twice.** `T4` folds an aggregate only where the overview draws no two relationships between one group and one entity that the original draws between other ends.
  A root's aggregate that would is offered trimmed of its shared parts, so a film rental schema folds its address chain alone.
- **A schema met by dropping rows folds only tight aggregates.** Past the target, an aggregate folds only when it adds no new reachable pair.
- **A star of alphabetical buckets is refused.** A plan whose every group is a range of one hub's sibling leaves gets no plan, per [MJL-0033](adrs/0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md).
  The reason says a list reads better, as a gateway fronting 34 services shows.
- **A tangled `erDiagram` folds its aggregates.** An overview meeting a cycle every four nodes keeps folding aggregates once the target is met, even by dropping rows alone.
  Each fold takes away an overview edge per entity it hides, down to 60% of `nodeTarget`. A tree-like schema stays at rows dropped.
- **A ticket family folds whole.** When every label leads with an id such as `PLAT-1201`, `T6` folds each family whole, hubs included, or in even contiguous runs.
- **Regions drawn from one template fold alike.** Two cloud regions with the same subnets fold to the same depth, in one step.
  Their groups are named apart by the region around them, as `Public subnets (us-east-1) (+2)`.
  The contract, and the test suite's two independent readers, accept that one qualified form.
- **A detail draws a group whole or as members, never both.** When edges join two groups both ways, the detail split again draws the other's members, so a nested overview names `PAYMENT_METHOD (CUSTOMER)`, per [MJL-0035](adrs/0035-a-region-folds-whole-and-a-nested-detail-names-members.md).
  Otherwise the detail needing fewer stubs draws them.
  The other draws the group as one stub, with edges each way, so `ORDER (+6) from PAYMENT` beside `ORDER (in group)` no longer appears.
  The contract, and both test readers, read an edge from a member into a whole group's stub as a half edge.
  The contract refuses a group drawn both ways in one detail.
- **Edges between a group's stub and a member are drawn once.** Edges of one kind one way keep only the label they share, as the overview does.
  So three labelled transitions from one group into `Allocating` read as one line.
- A plan may split a detail again with new reachable pairs.
  It now gives way to a plan holding regions to details that fit, when that one declares fewer in all.

- **A stub draws each edge once.** Edges from different members of one outside group into one member may share a label and kind.
  They are drawn once from the group's one stub, per [MJL-0032](adrs/0032-a-stage-folds-across-lanes-and-a-stub-draws-each-edge-once.md).
  The source group's detail still draws each of them exactly, so nothing is lost.
  A detail no longer draws one stub edge twice, or a stub per member such as `Checkout domain (+5) from paymentservice`.
  The contract, and the test suite's two independent readers, refuse a half edge drawn twice.
- **A pipeline stage folds though no edge joins it.** In `T6`, two nodes of one prefix family that share a neighbour pair like two an edge joins.
  So an ETL pipeline's `gold.` tables fold into one group with no new reachable pair.
- **A status stem names a family.** A label leading with a bare id, such as `10008 Ready for Release`, takes the one stem it shares with another such label.
  So a Jira workflow keeps `Ready for Release` and `Released` together, apart from `Code Review`.
- The contract refuses a suggested group its members do not connect.
  Members are joined by an edge, or by an author region the group folds.
  Two members of one family, or two leaves, are also joined by a neighbour they share.

## [0.10.0] - 2026-10-19

### Added

- **Decision regions in split plans.** A flowchart or `stateDiagram` decision now folds with its branches, up to where they rejoin.
  The group is named after the decision, per [MJL-0028](adrs/0028-decision-regions-and-aggregates-fold-whole.md).
  The region is single-entry single-exit, found from dominators and post-dominators, so the fold adds no reachable pair and belongs to `T2`.
  A branch that ends the flow folds inside the region, regions fold innermost first, and a chain stage may pass through a folded region.
  A decision-heavy flowchart that got no plan before now gets one under every preset.
- `SplitPlan` gains `ladder`, the overview's node count and score after each tier the plan walked, and the library exports its `LadderStep` type.
  The contract recounts it.
- The Summarising a diagram page explains dominators and decision regions, and plans a second, decision-heavy diagram under every preset.

### Changed

- **erDiagram plans group entities by aggregate root.** An entity belongs to the aggregate of its single identifying parent, or, as a leaf, of the one entity it depends on.
  `T4` folds the largest aggregate that fits, named after its root, and splits a root's aggregate again when none fits.
  A junction identified by two roots no longer folds into one side, and `T5` and `T6` keep it in view.
- A chain stage is named after the member where it starts, not its best-connected member.
- A twin class too large for one group is cut into runs of even size.
- After the target is met, `T2` folds the remaining decision regions evenly, while the overview keeps 60% of `nodeTarget`.
- **Groups of alike nodes are named by range.** This covers twins, sibling leaves and members whose labels all lead with an id, per [MJL-0029](adrs/0029-runs-meshes-and-terminals-read-as-they-are.md).
  The range is the first and last label in natural order, such as `accounts-service … feature-flag-service (+9)`.
  A range is refused when a member of another group falls inside it.
  An id-led group with no honest range is named by its first label.
  A twin class is put in label order before it is cut into runs.
- **A shared terminal stays in view.** A flowchart or `stateDiagram` node that three nodes or more lead into and that leads nowhere is no longer folded into one branch's group.
  This holds under the strict rules and under a new second rule set that folds hubs and branches.
- **Dense meshes fold by tight cliques.** When the overview joins at least half of all node pairs, `T6` also proposes maximal cliques, found by Bron and Kerbosch's algorithm with Tomita's pivot.
- The contract accepts a range label only in its one exact form, with a count two fewer than the members.
- **A group is named where a reader enters it.** A chain-like group in a flowchart or `stateDiagram` is named after its entry, not its exit, per [MJL-0030](adrs/0030-a-group-is-named-where-a-reader-enters-it.md).
  So a pipeline's first group reads `git push to main (+5)`.
  Twin chains are named after their first entry, never by a range across two stages.
- An aggregate whose root is a lookup is named after the member with the most edges crossing its boundary.
  A lookup root has every edge joining one other member, so Sakila now reads `FILM (+1)`, not `LANGUAGE (+1)`.
- In `T6`, a pair that would mix two pipeline stages, such as `bronze.` and `gold.`, loses a tie between equal gains.
- **A dense mesh is refused.** A dense mesh joins at least half of its node pairs, and more pairs than twice its nodes.
  A diagram, or a plan's overview, that is one gets no plan.
  The reason given is "dense mesh: a matrix or table reads better than a diagram".
- A shared terminal also covers a node whose every successor leads nowhere, so it stays in view.
  An example is a `Cancelled` state leading only to `Refunded` and `Voided`.
- Two edges from different members of one outside group can repeat one edge in a detail.
  The detail now draws them from a stub each, when it still meets its target.
- An overview lists the parallel edges between two nodes side by side, whichever way each is written.
- In `T4`, of two aggregates that save as much score per node hidden, the one leaving fewer overview edges goes first.
- A decision region hiding one node, such as `Signed off? (+1)`, is undone when the overview and every detail still meet the target without it.
- **A plan lands near its target.** A greedy walk can leave the overview below 60% of `nodeTarget`.
  The plan then undoes a group whose undoing still meets every target, per [MJL-0031](adrs/0031-a-plan-keeps-groups-even-and-names-each-stub-once.md).
  A compiler's class diagram now keeps six overview nodes at low density, not four.
- **No one aggregate takes most of a diagram.** An aggregate folded over the target is never folded again into its owner's, and any owner's aggregate may fold when none fits.
- **Suggested groups keep to one prefix family.** Under the strict rules, a `T5` or `T6` group never holds two families.
  A family comes from a dotted label such as `bronze.`, an id-led label such as `PLAT-1201`, or an id prefix like `br_`.
  In `T6`, a pair within one family goes first, not only on a tie.
  A plan that cannot meet its target so is walked again with families mixed.
- In `T4`, `T5` and `T6`, some folds come within 5% of the best saving.
  Of those, the one leaving the fewest parallel overview edges goes first.
  A SaaS billing overview no longer draws five parallel edges between two aggregates.
- **Stubs for one group drawn apart name their member.** Each reads like `Checkout domain (+5) from paymentservice`, so a detail never shows two stubs with one text.
  When that text would not name the group alone, the detail draws one stub.
  A stub for a whole group beside one for the member it is named after is named the same way.
  The contract checks that the member named draws every edge its stub draws.

## [0.9.0] - 2026-10-19

### Added

- **Split plans for an oversized diagram.** A diagram over a node count or score threshold gets a split plan when one is found.
  The plan is an overview where groups of nodes fold into group nodes, plus one detail diagram per group.
  A plan is offered only when a contract parses the emitted text and finds every node and edge kept, per [MJL-0025](adrs/0025-a-fold-is-offered-as-a-split.md).
- Each node count and score rule ends its remediation with the plan when one is offered.
  The added sentence reads like `Split plan: an overview folding 7 groups (...), and one detail diagram per group`.
  The text before it is unchanged, and no complexity rule gains a fixer.
- `--split-plan` prints, after the report, the overview and every detail diagram of each plan as mermaid fences, under a heading naming `file:line` and the tier.
  It writes no file, exits as a check does, and refuses `--fix`, `--json`, `--list-rules` and `--validate-plugins`.
- The library exports `splitPlan`, `splitOutcome` and the `SplitPlan`, `SplitGroup`, `SplitDetail`, `SplitLoss`, `SplitOutcome` and `Tier` types.
  `Diagram` gains `graph()`, the parser's nodes, edges and subgraphs, read once.
- A docs site page, [Summarising a diagram](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/summarisation/), explains the graph theory behind split plans, the tier ladder and the contract.
  It plans one large diagram under every preset, drawn by the site build from what `splitPlan` returns.
- A split plan folds the author's regions first and folds repeated patterns evenly, per [MJL-0026](adrs/0026-a-split-plan-follows-the-authors-structure.md).
  Group nodes are marked in every diagram type, and a long group label is cut in the middle.
- A detail draws an edge from another group from one stub for that group, and a stub label names what it stands for.
- `DiagramGraph` nodes carry `markdown`, `rows` and `regions`.
  Split plans draw entity attributes and class members in details and in row diagrams, and `--split-plan` prints them.
- A diagram whose composite state has concurrent regions gets no split plan, with the reason `concurrent state regions are not split`.
- A stub's text in a split plan has exactly one reading.
  A text that could name another node, region or group adds the id it stands for, and the contract refuses any stub that reads otherwise.
- A lollipop interface on a folded class hangs from its group in the overview.
- A state's description lines are carried into split plans, and `DiagramGraph` nodes carry `descriptions`.
- The overview merges a start or end marker's transitions into one group into one transition, and `SplitLoss` counts them as `mergedMarkers`.
- `--split-plan` prints a detail that is split again only as its split, so every printed diagram meets the target.
- Suggested grouping pairs only nodes an edge joins, with alike labels breaking ties.
  No plan leaves an overview with fewer than four nodes unless the diagram has fewer than eight.
- A split plan's overview lands near its target.
  Once the target is met, folding stops while the overview would keep fewer than 60% of `nodeTarget`, unless a detail needs more folded.
- `T5` and `T6` keep hubs and decisions as their own nodes, and never group two targets of a decision's differently labelled branches.
- No suggested group hides a single node, and a suggested group is named after the member with the most edges crossing its boundary.
- An undirected link written both ways between two overview nodes is drawn once, and `SplitLoss` counts these as `reversedEdges`.

### Changed

- **A diagram's keyword now comes from mermaid's own type detection, so some values change.** For example, `graph` now reads as `flowchart` and `C4Context` as `c4`.
  A `-beta` or `-v2` keyword drops its suffix.
  A plugin that compares a diagram's keyword with an old value must update it, per [MJL-0022](adrs/0022-start-from-the-official-parsers-output.md).
- The `diagram_type` of an architecture, packet, radar, treemap, treeView or wardley diagram is mermaid's id, such as `architecture`.
- `radar`, `treeView` and `wardley` without their `-beta` suffix are unparseable, because mermaid does not draw them.
- A parse failure is the parser's own error.
  A diagram under frontmatter or a directive that parses with no nodes now passes.
- A parser reason is built from the parser's structured error.
  A line number at the end of a diagram is now the real line.
- Fences are read from micromark's tokens rather than scanned.
  `Diagram` gains `closingFence`, and `DiagramStats` gains `error_line`.
- Contrast style directives are read from mermaid's parsed diagram, not a scan of its text, per [MJL-0022](adrs/0022-start-from-the-official-parsers-output.md).
  Text inside a label is no longer taken for a `classDef`, `style` or `linkStyle`.
  A style joined to another statement by `;` is read.
- `class A,B name` and `:::` give a node its classes, so a node's `style` is scored on what it inherits.
- Each style statement and sequence `rect` is placed by its lexer token, and a value the parser cannot place exactly is never rewritten.
- `classDef a,b` and `linkStyle 0,1` give one directive per id, and their shared `color:` is fixed once.
- A `classDef` or `style` in a type the audit does not model, such as `block-beta`, reports `contrast-directive-unauditable`.
- An unparseable diagram gets no contrast findings, only `parse-diagram-unparseable`.
- A sequence theme variable's line is read from the frontmatter.
  One set in `%%{init}%%` points at the keyword line.
- **Breaking for the library:** `Diagram.directives` is now `Diagram.styles()`, which returns a promise of a `StyleReading`.
  `StyleDirective` loses the `inlineClass` kind and `class_name`.
- `micromark`, `stemmer` and `yaml` are new runtime dependencies.
- A contrast value is placed from the tokens the lexer read for it, and `--fix` refuses more often rather than guess, per [MJL-0027](adrs/0027-gaps-in-the-official-parsers-are-recorded.md).
  A classDiagram's colours are reported but never rewritten, because its lexer reads a statement's declarations as one run of text.
  A value after text mermaid edits out of the line, such as a `;` before a comma, is not rewritten.
  Nor is a value colorjs.io does not read as a colour, such as `rgb(255` where mermaid cuts `rgb(255,255,255)` at its commas.
- A style declaration is read as mermaid's renderer reads it: its value is the text between its first colon and its second.
- A translucent out-of-gamut colour is clipped to sRGB before it is blended over its backdrop, as colorjs.io mixes it.

### Fixed

- A style statement is never placed inside the frontmatter, even when a block scalar there repeats its text.
  The finding pointed at the frontmatter line, and `--fix` rewrote the frontmatter title instead of the diagram.
  A parsed line that more than one source line could be is no longer placed, so its value is not rewritten.
- A stateDiagram `style` inside a composite state, which mermaid does not apply, no longer takes the span of a root state's value.

- A flowchart edge to a subgraph's id, such as `A --> S` where `S` is a subgraph, no longer counts `S` as a node as well.
  Mermaid draws that edge to the subgraph's box, so the diagram's node count drops by one for each such subgraph.
- A stateDiagram's concurrency regions, split by `--` inside a composite state, no longer count as nodes or subgraphs.
  Mermaid draws each region as a dashed-off area of the composite's box, so the states in it count inside the composite.
  A composite with regions now nests one deep, not two.
- A label holding an HTML tag, a `<br>` or a bare `<` is read whole.
  The DOM shim made mermaid's sanitiser drop the text before a tag, and all but the last line of a `<br>` label.
  It also dropped any label holding `<`.
- A label holding an HTML entity, such as `&lt;tag&gt;`, reads back as itself in a split plan's diagrams.

## [0.8.1] - 2026-10-18

### Fixed

- Each worked example on the Measuring complexity page draws its diagram, beside its source and the structure the parser returned.

## [0.8.0] - 2026-10-18

### Changed

- **Complexity scores change for sequence, state, entity and class diagrams.** A diagram near a threshold may cross it either way, per [MJL-0021](adrs/0021-the-score-counts-what-a-reader-must-read.md).
- A `sequenceDiagram` counts only messages as edges.
  Notes, activations, `autonumber` and the lines that open, divide or close a block no longer count.
- A `sequenceDiagram` counts each `box` and each block, such as `loop` or `alt`, as a subgraph.
  A block inside another adds a level of nesting, so blocks nested three deep fire `complexity-subgraph-nesting-too-deep`.
  A `rect` is a background tint, so it is not counted.
- A `stateDiagram` no longer counts start and end markers, their transitions, or notes.
- An `erDiagram` entity's attributes, and a `classDiagram` class's attributes and methods, are rows.
  Each row adds 0.25 points to the visual complexity score, and the new `rowWeight` option sets that weight.
- A `classDiagram` counts each `namespace` as a subgraph.
  A namespace inside another adds a level of nesting.
- `DiagramStats` gains `rows`, and `ThresholdConfig` gains `row_weight`.
  `same-diagrams` also compares `rows`.
- The Measuring complexity page has worked examples for sequence, entity and state diagrams.

### Fixed

- A one-word `box` title in a `sequenceDiagram`, such as `box Shop`, is read as its title rather than as its fill colour.

## [0.7.4] - 2026-10-18

### Changed

- The agent evals page shows each case's original fixture and the file every harness and model left behind.
- The agent evals now cover the tier 1, 2 and 3 models of Claude Code and Codex, with `claude-haiku-5-5` in place of `claude-haiku-4-5`.
  The page shows the new run.

## [0.7.3] - 2026-10-17

### Changed

- The README and the docs site home show package badges: npm version, monthly downloads, Node range, CI, Docs and licence.

## [0.7.2] - 2026-10-17

### Changed

- The docs site home page follows the README section by section.
- Measuring complexity builds the score one idea at a time, with a graph of what mermaid's parser returned for each example and its worked score.
- How a run works and the plugin model gain sequence diagrams, each with a simple and a detailed version.
- The site's OsakaNights theme lives in `docs-site/theme/osakanights/`, ready for another MkDocs Material site to adopt.
- Every Biome complexity rule now fails the check, and the code is refactored to pass with no change in behaviour.

## [0.7.1] - 2026-10-16

### Changed

- The README is now a short front page that shows one command, its output and the fix.
  Everything else links into the docs site.

## [0.7.0] - 2026-10-16

### Added

- `--disable-category NAME` turns off every rule in a category for one run, after the config is applied.
- `--category NAME` turns on every rule in a category for one run, even one the config turns off, with the options the config gives it.
- Each category flag may be repeated or take a comma-separated list, such as `--disable-category parse,complexity`, and works for a plugin's category too.
- `--list-rules` takes the category flags, to show the rules a run would use.
- `buildRegistry` and `setUp` take a `selection` of categories to enable and disable, exported as the `CategorySelection` type.

A category that is not loaded, one named by both flags, or flags that turn off every rule fail with `error[flag]` and exit code 2.
`--validate-plugins` refuses a category flag, since it checks every plugin.
See [MJL-0020](adrs/0020-category-flags-have-the-last-word-for-a-run.md).

## [0.6.3] - 2026-10-16

### Changed

- `--list-rules` refuses a path, `--fix`, `--json`, `--preset`, `--profile`, `--canvas-light` or `--canvas-dark` with `error[flag]`, since it would ignore them.
  It takes only `--config` and `--no-plugins` or `--lenient-plugins`, and its `--help` usage line now lists them.

## [0.6.2] - 2026-10-16

### Added

- The `--json` object carries `canvasSetAside`, the files whose config canvas was set aside because `auto` scores them under `mkdocs-material`.
  Before, only a stderr line named them, so a job reading the JSON object never learnt the canvas was dropped.

## [0.6.1] - 2026-10-16

### Changed

- A canvas from the config no longer stops a run over a file that `auto` scores under `mkdocs-material`.
  The canvas is set aside for that file, which is scored under `mkdocs-material`, and one stderr line names every such file.
  A canvas flag on such a file is still `error[canvas-profile]`.
  So is a canvas from the config or the flags beside a `mkdocs-material` profile from the other.
  A canvas flag beside `--profile mkdocs-material` is still `error[flag]`, and a canvas beside `profile` `mkdocs-material` on one config rule is still `error[rule-option]`.
- The `error[canvas-profile]` hint names the way out of the setting that caused it.

### Added

- `canvasSetAside(file, flags, registry)` in the library says whether a file sets its config canvas aside.

### Fixed

- `--canvas-light` and `--canvas-dark` reach every rule option of type `canvas`, whatever its name.
  Before, a plugin option of that type received them only when it was named `canvas`.

## [0.6.0] - 2026-10-16

### Added

- A host that draws its own page can set the canvas, so page-backed colours are scored on the page a reader sees.
  `--canvas-light` and `--canvas-dark` set it for a run, and a `canvas` option of `{ light, dark }` sets it on the contrast rules in the config.
  The library takes it as `RunFlags.canvas`.
  Translucent fills, edge label boxes and a sequence diagram's page-backed text and lines are scored on it.
  The default stays GitHub's `#ffffff` and `#0d1117`, so a run that sets no canvas reports what it did before.
- The canvas applies under the `github` profile only.
  A file scored under `mkdocs-material` refuses a canvas rather than ignoring it.
  A canvas flag beside `--profile mkdocs-material` is `error[flag]`, and a canvas beside `profile` `mkdocs-material` on one config rule is `error[rule-option]`.
  Any other canvas on such a file is the new `error[canvas-profile]` (`CanvasProfileError`).
- A canvas colour that will not parse, or is translucent, is `error[flag]` from a flag and `error[rule-option]` from the config.
- A plugin rule may declare an option of the new type `canvas`. It receives the canvas flags as the contrast rules do, and its value is checked the same way.

## [0.5.0] - 2026-10-16

### Added

- Sequence diagrams are scored for contrast in light and dark, so the tenet "Readable in light and dark" now covers them.
  Their theme colours are read from frontmatter and `%%{init}%%` directives and resolved by Mermaid's own theme engine.
  Labels, arrows, lifelines, actors, notes, frames, activation bars, numbers and `rect` backgrounds are scored, and messages are scored against the page.
  Findings use the existing contrast rules, and `themeCSS` or an unmodelled theme is reported as `contrast-directive-unauditable`.

### Changed

- `mermaid` is pinned to exactly 11.17.2, because the sequence colours it resolves change between releases.
- The `error[plugin-source]` message for a TypeScript local rule says Node 23 needs 23.6 or newer. Node 23.0 to 23.5 cannot import TypeScript.

### Upgrading from 0.4.2

- **A sequence diagram that passed before may now fail.** One likely cause is a fixed message colour that fades on a dark page. Another is a note with no colours set, which Mermaid's dark theme draws at 4.49 to 1. Set `noteBkgColor` and `noteTextColor` to one readable pair, and leave colours on the page to the theme.

## [0.4.2] - 2026-10-16

### Fixed

- A rule that declares a `preset` option now receives the canonical preset name, such as `high-density`.
  It no longer receives an alias such as `high` as typed.

## [0.4.1] - 2026-10-16

### Changed

- `checkMarkdown`, `checkModel`, `fixSource` and `fixSourceReport` reject an unknown `preset` or `profile` in `RunFlags` with `FlagError`, code `flag`. They rejected with a plain `Error` before.
- `--help` describes `--json`.

## [0.4.0] - 2026-10-16

### Fixed

- Fix verification refuses an edit that leaves a diagram unparseable when it parsed before. `same-diagrams` also requires each diagram's parse result to be unchanged, and `same-tree` refuses an edit that breaks a diagram's parse.
- `complexity-subgraph-nesting-too-deep` no longer fires on the depth of a `mindmap`, `treemap`, `treeView` or `ishikawa`, which draw no subgraphs. Their depth still counts toward the visual complexity score, which is unchanged.
- A `flowchart-elk` diagram is read and measured as a flowchart. 0.3.0 reported it as `parse-diagram-unparseable`.

### Changed

- `DiagramStats` gains `max_tree_depth`, the depth of a tree-shaped diagram. `max_subgraph_depth` is now 0 for `mindmap`, `treemap`, `treeView` and `ishikawa`.
- `same-diagrams` also compares `max_tree_depth`.
- `error[fix-outside-root]` now ends "or run on the target path itself".
- The `parse-fence-unterminated` remediation says to add the closing fence directly after the diagram's last line. It also says to repeat the opening line's prefix: `> ` in a quote, or the item's indent in a list.
- `make evals-dry` writes its report under `tmp/evals-dry/`, so the last live run's report stays as it was.
- The docs site deploys after the Publish workflow succeeds, or when its workflow is run by hand, so it describes the latest release. A pull request or a push to `main` only builds it.
- The agent skill's remediation table covers `parse-fence-unterminated`, and gives `contrast-text-below-aa` its own rows for `mkdocs-material` and a `linkStyle`. It tells the agent to follow a finding's own `remediation` where that says more than the table.

### Upgrading from 0.3.0

- **A plugin fixer may see an edit refused.** An edit that turns a parseable diagram into an unparseable one is refused, and the finding stays. So is a `same-diagrams` edit that makes an unparseable diagram parse.
- **Code that reads `max_subgraph_depth` for a tree-shaped diagram reads 0.** Read `max_tree_depth` instead.

## [0.3.0] - 2026-10-15

### Added

- The package ships `.d.ts` type declarations in `dist/types/`, so a TypeScript project type-checks a plugin with no extra compiler options.
- `error[package-json]`, exit 1, for a project `package.json` that is not a JSON object. A `--no-plugins` run carries on past it. An installed plugin whose `package.json` is not a JSON object fails to load with `error[plugin-source]`, which `--lenient-plugins` skips. 0.2.0 stopped with an uncaught error there.
- `error[fix-not-converging]`, exit 1, names the rules whose fixers never stop proposing edits.
- `error[fix-outside-root]`, exit 2, stops `--fix` before it writes through a symbolic link whose target is outside the project root.
- The library exports the types `Preset`, `ThresholdConfig`, `PluginFailure`, `SourceKind`, `Setup`, `SetupOptions` and `Collected`. `setUp` also returns the project `root`.

### Changed

- A directory walk names each symbolic link it skips on standard error. A link named as a path is still checked.
- `quadrantChart` counts each plotted point as a node, with each quadrant that has a label.
- `timeline` counts each event as a node, and an `xychart` with a numeric x-axis counts the points of its longest series.
- A composite state in `stateDiagram` also counts as a subgraph, so its nesting depth is measured.
- A rule's `ctx.file` is the absolute path in both `check` and `fix` in a command run.
- `main(argv, cwd)` finds the `auto` profile from each file's own folder, whatever the process's working directory.
- `same-tree` on a `.mmd` or `.mermaid` file also requires the diagram's structure to be unchanged, as `same-diagrams` does.
- Two local rule files with one name, such as `house-x.js` and `house-x.mjs`, fail the load with `error[plugin-contract]`.
- A plugin rule may declare the options `preset` and `profile` only as `"string"`, and they keep their built-in meaning.
- A rule key or namespace may not end in a hyphen or hold two in a row.
- A config `plugins` entry that is not installed reports `kind` `config`, not `package`.
- `--help` names every plugin source, says which flags import plugins, and lists exit 1 for a failed run.

### Upgrading from 0.2.0

- **A plugin may fail to load.** Rename a rule key or namespace with a trailing or doubled hyphen. Rename a `preset` or `profile` option that is not a string.
- **Two local rule files with one name fail the load.** Files such as `house-x.js` and `house-x.mjs` loaded as one rule on 0.2.0, and now fail with `error[plugin-contract]`, exit 1. Keep one of them.
- **`--fix` may stop on a symbolic link.** A named link whose target is outside the project root now stops `--fix` with `error[fix-outside-root]`, exit 2, before any file is written. Fix the target in its own project, or run on the target path itself.
- **A plugin author sees two values change.** A rule's `ctx.file` is the absolute path in a command run. A config `plugins` entry that is not installed reports `kind` `config` in `--json`, not `package`.
- **A diagram may newly exceed a complexity limit.** `quadrantChart`, `timeline`, `xychart` and `stateDiagram` now count more nodes, and nested composite states can exceed the nesting limit.

## [0.2.0] - 2026-10-15

### Upgrading from 0.1.1

A project that passed on 0.1.1 can fail on 0.2.0.

- **Every `linkStyle` `color:` is now reported.** No one colour reads on the edge label box in both themes, and `--fix` cannot clear it. Remove the `color:` from the `linkStyle` line.
- **A one-line diagram that does not parse is now reported.** For example, `graph TD; A-->; B[[[` passed on 0.1.1. Repair the syntax.
- **A caret range does not reach 0.2.0.** Under 0.x, `^0.1.1` accepts only 0.1.x releases, so change the range to `^0.2.0`.

### Added

- `--version` prints the version, to quote in a bug report.
- A `.mermaid` file is read as a raw diagram, as a `.mmd` file is.
- The library exports `DIAGRAM_EXTS`, the raw diagram extensions, and `documentKind`, which says how a file name is read.
- The library exports `ConfigCodeError`, the error behind `error[config-code]`.
- `checkMarkdown` and `fixSource` read a file name ending in `.mermaid` as a raw diagram, as they read `.mmd`.
- A `linkStyle` `color:` is scored as edge label text, against Mermaid's own label box in light and dark, under the `github` profile.
- Profile `auto` also reads `mkdocs.yaml`, not only `mkdocs.yml`, as a sign that the site renders through Material.
- `skills/mermaidjs-lint/` is an agent skill that drives the linter, with a live eval suite.
- A documentation site at <https://jpeakai.github.io/jpai-mermaidjs-lint/>, with the rules drawn before and after `--fix`.

### Changed

- `parse-diagram-unparseable` reports any diagram mermaid's parser reports an error for, on one line or many.
- A valid diagram with no nodes, such as `pie` with a `title` line or `info`, is no longer reported as unparseable.
- The parse finding's message carries the parser's own reason.
- `complexity-visual-score-critical` names the complex threshold, `vcsComplex`, which is the value it compares against.
- `--help` states which setting wins: a threshold option, then a `--preset` or `--profile` flag, then the config's preset or profile.
- `--help` lists the folders a directory walk skips.
- The npm page links the docs site as the package's homepage.
- `--no-plugins` sets aside a config setting for a plugin rule, instead of failing on it as an unknown rule.
- A usage error prints the error, the synopsis and a pointer to `--help`, rather than the whole help.
- `--help` links the rules page on the docs site instead of `RULES.md`.

### Security

- `--no-plugins` no longer imports a `mermaidjs-lint.config.mjs`, which is code. The run stops with `error[config-code]` and exit 2 instead, and `--config` with a `.json` config lets it run.

## [0.1.1] - 2026-10-15

The same code as 0.1.0, published again under the next version number.

## [0.1.0] - 2026-10-15

The first release: the parse, contrast and complexity rules, `--fix` with verification, the config file, local rules and plugin packages.

[Unreleased]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.4...v0.8.0
[0.7.4]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.3...v0.7.0
[0.6.3]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jpeakai/jpai-mermaidjs-lint/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jpeakai/jpai-mermaidjs-lint/releases/tag/v0.1.0
