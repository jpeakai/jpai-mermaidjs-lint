"""Eval: does an agent repair a border that vanishes against its fill?

The fixture is ``contrast-border-reported``: a white fill with black text, which passes,
and a near-white ``stroke:`` that does not. The linter reports
``contrast-border-below-ui-minimum`` and ships no fixer, because a border colour is a
design choice. The fix is a stroke that reads at 3:1 or better against the fill, leaving
the label pair alone.

The golden is the rule fixture's committed ``.llm.md`` sibling, compared for structure
only. Which stroke clears 3:1 is the agent's choice and the linter's verdict.
"""

from __future__ import annotations

from _lint import (
    LINT_SCRATCH,
    SKILL,
    TASK,
    check_fences_kept,
    check_lint_clean,
    check_nodes_kept,
    fixture_text,
    golden_path,
)
from pytest_xharness_eval import CaseOutput, evalcase
from pytest_xharness_eval.verify import (
    Exact,
    Facet,
    GoldenCase,
    check_files_written,
    check_no_files_added,
    check_rollout,
    facets,
)

FIXTURE = "border_below_minimum"  # evals/fixtures/border_below_minimum/
TARGET = "contrast-border-reported.md"

GOLDEN = GoldenCase(
    golden=golden_path("contrast-border-reported"),
    path=TARGET,
    facets=(
        Facet(
            name="mermaid fences",
            extract=facets.fence_count,
            tolerance=Exact(),
            why="the one fence is fixed in place, not replaced or duplicated",
        ),
        Facet(
            name="node ids",
            extract=facets.node_ids,
            tolerance=Exact(),
            why="a border fix must not add, drop or rename a node",
        ),
        Facet(
            name="edges",
            extract=facets.edges,
            tolerance=Exact(),
            why="a border fix must not rewire the diagram",
        ),
    ),
)


@evalcase(task=TASK.format(target=TARGET), skill=SKILL, fixture=FIXTURE)
def eval_border_contrast(output: CaseOutput) -> None:
    """Evidence, scope, the diagram survived, then this repository's linter is clean."""
    check_rollout(output)
    check_files_written(output, TARGET)
    check_no_files_added(output, allow=LINT_SCRATCH)
    seed = fixture_text(FIXTURE, TARGET)
    check_fences_kept(output, TARGET, seed)
    check_nodes_kept(output, TARGET, seed)
    GOLDEN.assert_matches(output)
    check_lint_clean(output, TARGET)
