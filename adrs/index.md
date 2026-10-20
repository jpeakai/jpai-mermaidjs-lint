<!-- GENERATED from the bundle's *.yml by okf_render.py. Do not edit; regenerate. -->

# Decision Records

| Record | Decision | Status |
|---|---|---|
| [MJL-0001](0001-parse-with-mermaids-own-parsers.md) | Every diagram is measured by mermaid's own parsers | accepted |
| [MJL-0002](0002-one-rule-per-finding-code.md) | One rule per finding code, one file per rule | accepted |
| [MJL-0003](0003-findings-fail-or-the-rule-is-off.md) | A finding fails the run, or the rule is off | accepted |
| [MJL-0004](0004-complexity-is-never-autofixed.md) | No complexity rule has a fixer | accepted |
| [MJL-0005](0005-a-fixer-refuses-when-unsure.md) | A fixer refuses whenever the answer is a design choice | accepted |
| [MJL-0006](0006-every-fix-is-verified-by-reparse.md) | Every edit is proven by re-parsing the document | accepted |
| [MJL-0007](0007-plugins-follow-the-prose-gates-contract.md) | Plugins follow the prose-gates contract | accepted |
| [MJL-0008](0008-node-bundle-keeps-mermaid-external.md) | The Node bundle keeps mermaid and its parsers external | accepted |
| [MJL-0009](0009-a-diagram-is-read-from-the-markdown-tree.md) | A diagram is a code node of the markdown tree | accepted |
| [MJL-0010](0010-thresholds-are-options-not-environment.md) | Thresholds are rule options and flags, never environment variables | accepted |
| [MJL-0011](0011-profile-decides-who-owns-label-text.md) | A contrast profile decides who owns the label text | accepted |
| [MJL-0012](0012-a-fixture-declares-its-own-expectation.md) | A fixture declares what it must report in its own file | accepted |
| [MJL-0013](0013-the-docs-site-is-generated-from-tested-sources.md) | The docs site is generated from the sources the tests run | accepted |
| [MJL-0014](0014-an-llm-fix-is-committed-and-verified.md) | An LLM fix is committed beside its fixture and verified clean | accepted |
| [MJL-0015](0015-four-tenets-define-the-tool.md) | Four tenets define what the tool guarantees | accepted |
| [MJL-0016](0016-a-back-edge-may-be-appended-to-an-accepted-record.md) | A back-edge may be appended to an accepted record | accepted |
| [MJL-0017](0017-sequence-colours-come-from-mermaids-theme-engine.md) | Sequence colours come from Mermaid's own theme engine | accepted |
| [MJL-0018](0018-a-host-sets-the-page-canvas-under-github-only.md) | A host sets the page canvas, under the github profile only | accepted |
| [MJL-0019](0019-a-material-file-sets-a-config-canvas-aside.md) | A Material file sets a config canvas aside | accepted |
| [MJL-0020](0020-category-flags-have-the-last-word-for-a-run.md) | Category flags have the last word for a run | accepted |
| [MJL-0021](0021-the-score-counts-what-a-reader-must-read.md) | The score counts what a reader must read, not every record the parser keeps | accepted |
| [MJL-0022](0022-start-from-the-official-parsers-output.md) | Every feature starts from the official parsers' output, and no parsing logic is reinvented | accepted |
| [MJL-0023](0023-markdown-is-read-only-through-mdast.md) | Markdown is read only through mdast, and reimplementing a dependency is non-compliance | accepted |
| [MJL-0024](0024-colour-and-contrast-come-from-colorjs.md) | Colour parsing and WCAG contrast come only from colorjs.io | accepted |
| [MJL-0025](0025-a-fold-is-offered-as-a-split.md) | A fold is offered only as the overview half of a split | accepted |
| [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) | A split plan follows the author's structure, and refuses what it cannot draw faithfully | accepted |
| [MJL-0027](0027-gaps-in-the-official-parsers-are-recorded.md) | Gaps in the official parsers are recorded, each with the one narrow workaround allowed | accepted |
| [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) | Decision regions and erDiagram aggregates fold whole, named after their decision or root | accepted |
| [MJL-0029](0029-runs-meshes-and-terminals-read-as-they-are.md) | Runs of alike nodes are named by range, dense meshes fold by cliques, and shared terminals stay in view | accepted |
| [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) | A group is named where a reader enters it, a dense mesh is refused, and a state that ends the flow stays in view | accepted |
| [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) | A plan lands near its target, keeps groups even and to one family, and names each stub once | accepted |
| [MJL-0032](0032-a-stage-folds-across-lanes-and-a-stub-draws-each-edge-once.md) | A pipeline stage folds across its lanes, a status stem names a family, and a stub draws each edge once | accepted |
| [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) | A plan folds ticket families whole, echoing regions alike and tangled aggregates, refuses alphabetical buckets, and draws a group whole or as members | accepted |
| [MJL-0034](0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md) | A refused plan prints the list or table that reads better, a pipeline folds by layer, aggregates draw no relationship twice, and a region holding most of a diagram folds as its parts | accepted |
| [MJL-0035](0035-a-region-folds-whole-and-a-nested-detail-names-members.md) | An author region folds whole however much of a diagram it holds, a pipeline folds by lane, and a detail split again names the members it reaches | accepted |
| [MJL-0036](0036-a-group-is-named-by-its-family-or-lanes-and-a-stub-by-its-group.md) | A group holding a whole family or twin lanes is named by them, a member stub names its group as the overview shows it, and one member's edges into a group draw in the target | accepted |
| [MJL-0037](0037-stubs-for-one-group-share-a-box-and-the-lighter-detail-draws-exactly.md) | Stubs for one group's members share a box, the lighter detail draws edges joining two groups one way, and a leaf fold saving alike keeps groups even | accepted |
# By group

## cli

* [MJL-0020](0020-category-flags-have-the-last-word-for-a-run.md) - --category and --disable-category switch whole categories on or off for one run, over the config
## complexity

* [MJL-0021](0021-the-score-counts-what-a-reader-must-read.md) - Control lines, markers and notes are left out, and boxes, blocks and attribute rows are counted
* [MJL-0025](0025-a-fold-is-offered-as-a-split.md) - A split plan is checked by a contract and applied by a human
* [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) - Regions fold first, marker states stay in their composite, and concurrency is refused
* [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) - A decision folds with its single-entry single-exit region, and an entity with the aggregate its root owns
* [MJL-0029](0029-runs-meshes-and-terminals-read-as-they-are.md) - Three choices that make a split plan's groups mean something a reader can check
* [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) - How a split plan names, refuses and keeps nodes so its overview reads as the diagram does
* [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) - How a split plan balances its groups, keeps them to one family and tells stubs apart
* [MJL-0032](0032-a-stage-folds-across-lanes-and-a-stub-draws-each-edge-once.md) - How a split plan groups a stage no edge joins, reads a family from id-led statuses, and draws edges from a whole group
* [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) - How a split plan treats stars, tangled schemas, ticket families, echoing regions and groups joined both ways
* [MJL-0034](0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md) - What a split plan prints in place of a star or dense mesh, and how pipelines, aggregates and outsized regions fold
* [MJL-0035](0035-a-region-folds-whole-and-a-nested-detail-names-members.md) - How outsized regions, pipeline lanes and the stubs between two groups joined both ways are drawn
* [MJL-0036](0036-a-group-is-named-by-its-family-or-lanes-and-a-stub-by-its-group.md) - How a split plan names a group no member speaks for, and how its stubs name members of other groups
* [MJL-0037](0037-stubs-for-one-group-share-a-box-and-the-lighter-detail-draws-exactly.md) - How a detail draws several stubs for one group, and which detail draws edges joining two groups one way
## config

* [MJL-0010](0010-thresholds-are-options-not-environment.md) - A preset and numeric overrides come from the config or a flag
## contrast

* [MJL-0011](0011-profile-decides-who-owns-label-text.md) - github scores the declared pairs, and mkdocs-material scores the host's forced text in both themes
* [MJL-0017](0017-sequence-colours-come-from-mermaids-theme-engine.md) - A sequence diagram is scored by theme variables Mermaid resolves on a pinned version
* [MJL-0018](0018-a-host-sets-the-page-canvas-under-github-only.md) - Page-backed colours are scored on a canvas the caller may set, and a canvas under mkdocs-material is refused
* [MJL-0019](0019-a-material-file-sets-a-config-canvas-aside.md) - A config canvas is set aside, with a note, for a file the auto profile reads as mkdocs-material
* [MJL-0024](0024-colour-and-contrast-come-from-colorjs.md) - No hand-written colour parser, luminance formula or contrast ratio
## decisions

* [MJL-0016](0016-a-back-edge-may-be-appended-to-an-accepted-record.md) - The one edit an accepted record allows is adding the inverse of a relation a newer record declares
## docs

* [MJL-0013](0013-the-docs-site-is-generated-from-tested-sources.md) - Reference pages come from RULES.md, the fixtures and examples, and the build re-checks every example
## fixing

* [MJL-0004](0004-complexity-is-never-autofixed.md) - Splitting a diagram changes what it says, so a human does it
* [MJL-0005](0005-a-fixer-refuses-when-unsure.md) - Contrast is repaired only with black or white, and only when it provably clears 4.5 to 1
* [MJL-0006](0006-every-fix-is-verified-by-reparse.md) - An edit is kept only when the markdown tree and every diagram's structure are unchanged
## packaging

* [MJL-0008](0008-node-bundle-keeps-mermaid-external.md) - dist inlines this package's code and leaves its dependencies to be installed
## parsing

* [MJL-0001](0001-parse-with-mermaids-own-parsers.md) - Structure comes from the Langium grammars and mermaid core, never from regexes over the text
* [MJL-0009](0009-a-diagram-is-read-from-the-markdown-tree.md) - Fences come from mdast, and offsets are mapped back to the source by line
* [MJL-0022](0022-start-from-the-official-parsers-output.md) - Diagrams are read through mermaid's parsers and markdown through mdast, never a custom parser
* [MJL-0023](0023-markdown-is-read-only-through-mdast.md) - No custom markdown parser, and code that duplicates an installed dependency is refactored onto it
* [MJL-0027](0027-gaps-in-the-official-parsers-are-recorded.md) - Where mermaid exposes no source map, export or detector, the gap and its pinned workaround are listed here
## plugins

* [MJL-0007](0007-plugins-follow-the-prose-gates-contract.md) - A plugin is { meta, rules } with a namespace, an apiVersion and declared categories
## policy

* [MJL-0003](0003-findings-fail-or-the-rule-is-off.md) - There is no warning level, and an advisory pair is not a finding
## rules

* [MJL-0002](0002-one-rule-per-finding-code.md) - Each distinct failure is its own rule id, so it can be switched off alone
## scope

* [MJL-0015](0015-four-tenets-define-the-tool.md) - Readable in light and dark, renders, simple enough to follow, and extensible, and nothing else belongs in the core
## testing

* [MJL-0012](0012-a-fixture-declares-its-own-expectation.md) - Each fixture names its expected rule ids in an expect comment, and a .fixed sibling pins its fix output
* [MJL-0014](0014-an-llm-fix-is-committed-and-verified.md) - Judgment fixes for what --fix leaves are authored once as .llm siblings, never generated at build time
# Relationship graph

Open [graph.html](graph.html) to explore the records visually: click a node to read it, and links between records navigate the graph.
The same edge set is rendered as prose in [graph.md](graph.md), and as data in [graph.json](graph.json).

* MJL-0001 --depended_on_by--> MJL-0002
* MJL-0001 --extended_by--> MJL-0022
* MJL-0001 --see_also--> MJL-0021
* MJL-0002 --depends_on--> MJL-0001
* MJL-0003 --depended_on_by--> MJL-0020
* MJL-0004 --extended_by--> MJL-0025
* MJL-0005 --depended_on_by--> MJL-0006
* MJL-0005 --see_also--> MJL-0025
* MJL-0006 --depends_on--> MJL-0005
* MJL-0009 --extended_by--> MJL-0023
* MJL-0015 --see_also--> MJL-0025
* MJL-0017 --see_also--> MJL-0018
* MJL-0017 --see_also--> MJL-0024
* MJL-0018 --see_also--> MJL-0017
* MJL-0018 --excepted_by--> MJL-0019
* MJL-0019 --excepts--> MJL-0018
* MJL-0020 --depends_on--> MJL-0003
* MJL-0021 --see_also--> MJL-0001
* MJL-0021 --see_also--> MJL-0025
* MJL-0022 --extends--> MJL-0001
* MJL-0022 --see_also--> MJL-0023
* MJL-0022 --see_also--> MJL-0025
* MJL-0022 --see_also--> MJL-0027
* MJL-0023 --extends--> MJL-0009
* MJL-0023 --see_also--> MJL-0022
* MJL-0023 --see_also--> MJL-0024
* MJL-0023 --extended_by--> MJL-0027
* MJL-0024 --see_also--> MJL-0023
* MJL-0024 --see_also--> MJL-0017
* MJL-0025 --extended_by--> MJL-0026
* MJL-0025 --extends--> MJL-0004
* MJL-0025 --see_also--> MJL-0005
* MJL-0025 --see_also--> MJL-0015
* MJL-0025 --see_also--> MJL-0021
* MJL-0025 --see_also--> MJL-0022
* MJL-0026 --extends--> MJL-0025
* MJL-0026 --extended_by--> MJL-0028
* MJL-0026 --extended_by--> MJL-0033
* MJL-0026 --excepted_by--> MJL-0034
* MJL-0026 --extended_by--> MJL-0035
* MJL-0027 --extends--> MJL-0023
* MJL-0027 --see_also--> MJL-0022
* MJL-0028 --extends--> MJL-0026
* MJL-0028 --extended_by--> MJL-0029
* MJL-0028 --excepted_by--> MJL-0030
* MJL-0028 --excepted_by--> MJL-0031
* MJL-0028 --extended_by--> MJL-0033
* MJL-0028 --excepted_by--> MJL-0034
* MJL-0029 --extends--> MJL-0028
* MJL-0029 --extended_by--> MJL-0030
* MJL-0029 --excepted_by--> MJL-0033
* MJL-0030 --extends--> MJL-0029
* MJL-0030 --excepts--> MJL-0028
* MJL-0030 --extended_by--> MJL-0031
* MJL-0030 --excepted_by--> MJL-0031
* MJL-0030 --excepted_by--> MJL-0032
* MJL-0030 --extended_by--> MJL-0033
* MJL-0030 --extended_by--> MJL-0034
* MJL-0030 --excepted_by--> MJL-0036
* MJL-0031 --extends--> MJL-0030
* MJL-0031 --excepts--> MJL-0030
* MJL-0031 --excepts--> MJL-0028
* MJL-0031 --excepted_by--> MJL-0032
* MJL-0031 --extended_by--> MJL-0032
* MJL-0031 --excepted_by--> MJL-0033
* MJL-0031 --extended_by--> MJL-0034
* MJL-0031 --excepted_by--> MJL-0036
* MJL-0031 --extended_by--> MJL-0037
* MJL-0032 --excepts--> MJL-0030
* MJL-0032 --excepts--> MJL-0031
* MJL-0032 --extends--> MJL-0031
* MJL-0032 --extended_by--> MJL-0033
* MJL-0032 --excepted_by--> MJL-0033
* MJL-0032 --extended_by--> MJL-0034
* MJL-0032 --excepted_by--> MJL-0036
* MJL-0033 --extends--> MJL-0030
* MJL-0033 --excepts--> MJL-0029
* MJL-0033 --extends--> MJL-0028
* MJL-0033 --excepts--> MJL-0031
* MJL-0033 --extends--> MJL-0032
* MJL-0033 --extends--> MJL-0026
* MJL-0033 --excepts--> MJL-0032
* MJL-0033 --extended_by--> MJL-0034
* MJL-0033 --excepted_by--> MJL-0034
* MJL-0033 --extended_by--> MJL-0035
* MJL-0034 --extends--> MJL-0033
* MJL-0034 --extends--> MJL-0030
* MJL-0034 --excepts--> MJL-0033
* MJL-0034 --excepts--> MJL-0028
* MJL-0034 --extends--> MJL-0031
* MJL-0034 --extends--> MJL-0032
* MJL-0034 --excepts--> MJL-0026
* MJL-0034 --excepted_by--> MJL-0035
* MJL-0034 --excepted_by--> MJL-0035
* MJL-0035 --excepts--> MJL-0034
* MJL-0035 --excepts--> MJL-0034
* MJL-0035 --extends--> MJL-0033
* MJL-0035 --extends--> MJL-0026
* MJL-0035 --excepted_by--> MJL-0036
* MJL-0036 --excepts--> MJL-0030
* MJL-0036 --excepts--> MJL-0031
* MJL-0036 --excepts--> MJL-0035
* MJL-0036 --excepts--> MJL-0032
* MJL-0036 --excepted_by--> MJL-0037
* MJL-0036 --extended_by--> MJL-0037
* MJL-0037 --excepts--> MJL-0036
* MJL-0037 --extends--> MJL-0036
* MJL-0037 --extends--> MJL-0031
