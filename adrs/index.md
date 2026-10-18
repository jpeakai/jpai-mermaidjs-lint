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
# By group

## cli

* [MJL-0020](0020-category-flags-have-the-last-word-for-a-run.md) - --category and --disable-category switch whole categories on or off for one run, over the config
## complexity

* [MJL-0021](0021-the-score-counts-what-a-reader-must-read.md) - Control lines, markers and notes are left out, and boxes, blocks and attribute rows are counted
* [MJL-0025](0025-a-fold-is-offered-as-a-split.md) - A split plan is checked by a contract and applied by a human
* [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) - Regions fold first, marker states stay in their composite, and concurrency is refused
* [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) - A decision folds with its single-entry single-exit region, and an entity with the aggregate its root owns
* [MJL-0029](0029-runs-meshes-and-terminals-read-as-they-are.md) - Three choices that make a split plan's groups mean something a reader can check
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
* MJL-0027 --extends--> MJL-0023
* MJL-0027 --see_also--> MJL-0022
* MJL-0028 --extends--> MJL-0026
* MJL-0028 --extended_by--> MJL-0029
* MJL-0029 --extends--> MJL-0028
