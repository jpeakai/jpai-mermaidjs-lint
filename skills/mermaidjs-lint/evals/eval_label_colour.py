"""Eval: does an agent declare a label colour for a fill that has none?

The fixture is ``contrast-directive-no-color``: a dark navy ``fill:`` with no ``color:``
beside it. The linter cannot audit the pair, so it reports ``contrast-directive-unauditable``
and has no fixer, because the right label colour depends on the fill. The fix is one
declaration, light text on the dark fill, reading at 4.5:1 or better.

The golden is the rule fixture's committed ``.llm.md`` sibling. It fixes the structure,
not the hex: any label colour that clears the linter is right, so the colour verdict comes
from the linter and the golden only guards the shape of the diagram.
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

FIXTURE = "label_colour_missing"  # evals/fixtures/label_colour_missing/
TARGET = "contrast-directive-no-color.md"

GOLDEN = GoldenCase(
    golden=golden_path("contrast-directive-no-color"),
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
            why="a colour fix must not add, drop or rename a node",
        ),
        Facet(
            name="edges",
            extract=facets.edges,
            tolerance=Exact(),
            why="a colour fix must not rewire the diagram",
        ),
    ),
)


@evalcase(task=TASK.format(target=TARGET), skill=SKILL, fixture=FIXTURE)
def eval_label_colour(output: CaseOutput) -> None:
    """Evidence, scope, the diagram survived, then this repository's linter is clean."""
    check_rollout(output)
    check_files_written(output, TARGET)
    check_no_files_added(output, allow=LINT_SCRATCH)
    seed = fixture_text(FIXTURE, TARGET)
    check_fences_kept(output, TARGET, seed)
    check_nodes_kept(output, TARGET, seed)
    GOLDEN.assert_matches(output)
    check_lint_clean(output, TARGET)
