"""Eval: does an agent split an oversized diagram into readable parts, keeping every node?

The fixture is ``complexity-large-chain``: one flowchart of nodes in a line, over the
hard node limit and the critical visual score. No fixer can split a diagram, so the agent
must restructure it: an overview plus one diagram per part is the skill's recipe. The
shortcut is to keep a sample of the chain and drop the rest, so the verdict is that the
union of node ids across every fence still holds every one of them.

The golden is the rule fixture's committed ``.llm.md`` sibling: an overview of five stages
and five stage diagrams. How many parts, where they cut and what the overview nodes are
called are the agent's choice, so the golden fixes only that the fix is several fences and
that every chain node survives somewhere.
"""

from __future__ import annotations

import re

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
    Facet,
    GoldenCase,
    Superset,
    check_files_written,
    check_no_files_added,
    check_rollout,
    facets,
)

FIXTURE = "chain_over_limit"  # evals/fixtures/chain_over_limit/
TARGET = "complexity-large-chain.md"

_CHAIN_NODE = re.compile(r"N\d+")


def chain_nodes(doc: str) -> set[str]:
    """The fixture's own ``N<k>`` nodes across every fence, leaving out any overview nodes."""
    return {node for node in facets.node_ids(doc) if _CHAIN_NODE.fullmatch(node)}


GOLDEN = GoldenCase(
    golden=golden_path("complexity-large-chain"),
    path=TARGET,
    facets=(
        Facet(
            name="mermaid fences",
            extract=facets.fence_count,
            tolerance=Count(lo=2, hi=None),
            why="no one diagram can hold the whole chain under the limit, so the fix is several",
        ),
        Facet(
            name="chain nodes",
            extract=chain_nodes,
            tolerance=Superset(),
            why="every node of the chain survives in some part; sampling the chain is not a split",
        ),
    ),
)


@evalcase(task=TASK.format(target=TARGET), skill=SKILL, fixture=FIXTURE)
def eval_large_chain(output: CaseOutput) -> None:
    """Evidence, scope, every node survived the split, then this repository's linter is clean."""
    check_rollout(output)
    check_files_written(output, TARGET)
    check_no_files_added(output, allow=LINT_SCRATCH)
    seed = fixture_text(FIXTURE, TARGET)
    check_fences_kept(output, TARGET, seed)
    check_nodes_kept(output, TARGET, seed)
    GOLDEN.assert_matches(output)
    check_lint_clean(output, TARGET)
