"""Eval: does an agent flatten subgraphs nested three deep without losing what they hold?

The fixture is ``complexity-nesting``: three subgraphs, one inside the next, around a
single edge. The linter reports ``complexity-subgraph-nesting-too-deep`` and has no fixer,
because which level to merge is a judgement. Flattening everything also passes, and is
fine; dropping the edge inside is not.

The golden is the rule fixture's committed ``.llm.md`` sibling, which merges the third
level into the second. Subgraph ids are containers, not nodes, so the golden fixes the
nodes and the edge and leaves the container names free.
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

FIXTURE = "nesting_too_deep"  # evals/fixtures/nesting_too_deep/
TARGET = "complexity-nesting.md"

GOLDEN = GoldenCase(
    golden=golden_path("complexity-nesting"),
    path=TARGET,
    facets=(
        Facet(
            name="mermaid fences",
            extract=facets.fence_count,
            tolerance=Exact(),
            why="one small diagram needs no split: the nesting is fixed in place",
        ),
        Facet(
            name="node ids",
            extract=facets.node_ids,
            tolerance=Exact(),
            why="merging a container must not add, drop or rename the nodes inside it",
        ),
        Facet(
            name="edges",
            extract=facets.edges,
            tolerance=Exact(),
            why="merging a container must not rewire what it held",
        ),
    ),
)


@evalcase(task=TASK.format(target=TARGET), skill=SKILL, fixture=FIXTURE)
def eval_nesting(output: CaseOutput) -> None:
    """Evidence, scope, the diagram survived, then this repository's linter is clean."""
    check_rollout(output)
    check_files_written(output, TARGET)
    check_no_files_added(output, allow=LINT_SCRATCH)
    seed = fixture_text(FIXTURE, TARGET)
    check_fences_kept(output, TARGET, seed)
    check_nodes_kept(output, TARGET, seed)
    GOLDEN.assert_matches(output)
    check_lint_clean(output, TARGET)
