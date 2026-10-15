"""Eval: does an agent repair a diagram that does not parse, rather than delete it?

The fixture is ``parse-unparseable``: a flowchart whose only edge has no target. The
linter reports ``parse-diagram-unparseable`` and leaves it alone, because a syntax error
needs an author. The cheapest way to zero findings is to delete the fence, so this case
leans hardest on the structure checks: the fence stays, node ``A`` stays, and its edge
now points somewhere.

The golden is the rule fixture's committed ``.llm.md`` sibling, which gives the edge a
target ``B``. The target's name is the agent's to choose, so the golden fixes the fence
count and that an edge exists, not which node it reaches.
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
    Count,
    Exact,
    Facet,
    GoldenCase,
    check_files_written,
    check_no_files_added,
    check_rollout,
    facets,
)

FIXTURE = "unparseable_edge"  # evals/fixtures/unparseable_edge/
TARGET = "parse-unparseable.md"

GOLDEN = GoldenCase(
    golden=golden_path("parse-unparseable"),
    path=TARGET,
    facets=(
        Facet(
            name="mermaid fences",
            extract=facets.fence_count,
            tolerance=Exact(),
            why="the broken fence is repaired in place; deleting it is the shortcut this case exists to catch",
        ),
        Facet(
            name="edges",
            extract=facets.edges,
            tolerance=Count(lo=1, hi=None),
            why="the dangling edge now has a target, whatever the agent names it",
        ),
    ),
)


@evalcase(task=TASK.format(target=TARGET), skill=SKILL, fixture=FIXTURE)
def eval_parse_repair(output: CaseOutput) -> None:
    """Evidence, scope, the diagram survived, then this repository's linter is clean."""
    check_rollout(output)
    check_files_written(output, TARGET)
    check_no_files_added(output, allow=LINT_SCRATCH)
    seed = fixture_text(FIXTURE, TARGET)
    check_fences_kept(output, TARGET, seed)
    check_nodes_kept(output, TARGET, seed)
    GOLDEN.assert_matches(output)
    check_lint_clean(output, TARGET)
