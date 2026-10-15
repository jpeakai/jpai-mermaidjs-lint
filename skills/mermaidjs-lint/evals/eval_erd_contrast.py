"""Eval: does an agent fix an unreadable ``erDiagram`` entity without the flowchart recipe?

The fixture is ``contrast-text-unfixable-erd``: an entity styled white on white. In a
flowchart the fix is a darker label colour. Here it is not: an entity draws its attribute
rows on light and dark backgrounds, so no single ``color:`` reads on all of them, and the
linter's fixer leaves the finding in place. The right answer drops the fill and label
colour and marks the entity with a stroke. An agent that applies the flowchart recipe by
rote keeps failing the linter.

The plugin's facets read flowchart syntax, so this case compares entities and
relationships with the extractors in ``_lint.py``. The golden is the rule fixture's
committed ``.llm.md`` sibling.
"""

from __future__ import annotations

from _lint import (
    LINT_SCRATCH,
    SKILL,
    TASK,
    check_fences_kept,
    check_lint_clean,
    entities,
    fixture_text,
    golden_path,
    relationships,
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

FIXTURE = "erd_white_on_white"  # evals/fixtures/erd_white_on_white/
TARGET = "contrast-text-unfixable-erd.md"

GOLDEN = GoldenCase(
    golden=golden_path("contrast-text-unfixable-erd"),
    path=TARGET,
    facets=(
        Facet(
            name="mermaid fences",
            extract=facets.fence_count,
            tolerance=Exact(),
            why="the one fence is fixed in place, not replaced or duplicated",
        ),
        Facet(
            name="entities",
            extract=entities,
            tolerance=Exact(),
            why="a styling fix must not add, drop or rename an entity",
        ),
        Facet(
            name="relationships",
            extract=relationships,
            tolerance=Exact(),
            why="a styling fix must not change the model's cardinalities",
        ),
    ),
)


@evalcase(task=TASK.format(target=TARGET), skill=SKILL, fixture=FIXTURE)
def eval_erd_contrast(output: CaseOutput) -> None:
    """Evidence, scope, the model survived, then this repository's linter is clean."""
    check_rollout(output)
    check_files_written(output, TARGET)
    check_no_files_added(output, allow=LINT_SCRATCH)
    seed = fixture_text(FIXTURE, TARGET)
    check_fences_kept(output, TARGET, seed)
    missing = entities(seed) - entities(output.read(TARGET))
    assert not missing, f"entities of the fixture are gone from {TARGET}: {sorted(missing)}"
    GOLDEN.assert_matches(output)
    check_lint_clean(output, TARGET)
