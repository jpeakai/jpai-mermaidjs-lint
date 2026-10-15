"""The shared verdict: this repository's own linter, plus proof the diagram survived.

Every case grades the same two things after the plugin's evidence checks:

1. **The linter is clean.** The agent's file is linted with this repository's source,
   ``src/bin.ts``, resolved from this file's location, never a published copy. So a cell
   grades the linter the repo is about to ship, and a rule that changes here changes the
   verdict on the next run.
2. **The diagram was fixed, not deleted.** Zero findings is trivially reached by removing
   the fence. So each case also asserts the fence count did not drop and the node ids the
   fixture declares are all still there: per document for a styling or syntax fix, and as
   the union across fences for a complexity fix that splits one diagram into several.

The plugin's ``node_ids`` reads flowcharts only, so the ``erDiagram`` case uses
:func:`entities` and :func:`relationships` instead.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from pytest_xharness_eval import CaseOutput
from pytest_xharness_eval.verify import facets

EVALS = Path(__file__).resolve().parent
SKILL_DIR = EVALS.parent
REPO = SKILL_DIR.parent.parent
LINTER = REPO / "src" / "bin.ts"
#: The committed rule fixtures. Each failing ``<rule>.md`` has a ``<rule>.llm.md`` sibling
#: that passes the linter, which is the golden a case compares against.
RULE_FIXTURES = REPO / "tests" / "fixtures" / "rules"

SKILL = re.search(r"^name:\s*(\S+)", (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8"), re.MULTILINE)[1]

#: What a run may leave beside the file. The linter writes nothing but the file it fixes,
#: and ``bunx`` / ``npx`` cache outside the workspace, so this allows only a tool cache
#: directory. Anything else the agent adds is still flagged.
LINT_SCRATCH = (".*_cache/*",)

#: What a user types after naming the skill. One sentence for every case, so a
#: difference between cells is the fixture's and never the wording's.
TASK = "{target}: fix every finding the linter reports on its diagram, editing the file in place."


def fixture_text(fixture: str, target: str) -> str:
    """The seed document a case starts from: ``evals/fixtures/<fixture>/<target>``."""
    return (EVALS / "fixtures" / fixture / target).read_text(encoding="utf-8")


def golden_path(rule_fixture: str) -> Path:
    """The committed ``.llm.md`` sibling of a rule fixture, which passes the linter."""
    return RULE_FIXTURES / f"{rule_fixture}.llm.md"


# -- 1. The linter ----------------------------------------------------------------------


def lint(path: Path) -> list[dict[str, object]]:
    """Lint ``path`` with this repository's source; return its findings.

    Raises:
        RuntimeError: the linter could not run or gave no JSON (no ``bun``, a usage error,
            a plugin that failed to load). That is the host, not the agent, so the cell
            grades ``error`` rather than ``fail``.
    """
    result = subprocess.run(
        ["bun", "run", str(LINTER), "--json", "--profile", "github", str(path)],
        cwd=path.parent,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(f"the linter exited {result.returncode} on {path}:\n{result.stdout}{result.stderr}")
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"the linter printed no JSON for {path}:\n{result.stdout}{result.stderr}") from exc
    return list(report["findings"])


def check_lint_clean(output: CaseOutput, target: str) -> None:
    """The real verdict: this repository's linter reports zero findings on the agent's file."""
    findings = lint(output.path(target))
    summary = "\n".join(f"  {f['rule']} (line {f['line']}): {f['message']}" for f in findings)
    assert not findings, f"{len(findings)} finding(s) remain in {target}:\n{summary}"


# -- 2. Fixed, not deleted --------------------------------------------------------------


def check_fences_kept(output: CaseOutput, target: str, seed: str) -> None:
    """At least as many mermaid fences as the fixture: no diagram was removed to pass."""
    want, got = facets.fence_count(seed), facets.fence_count(output.read(target))
    assert got >= want, f"{target} has {got} mermaid fence(s), the fixture had {want}: a diagram was removed"


def check_nodes_kept(output: CaseOutput, target: str, seed: str) -> None:
    """Every node id the fixture declares is still drawn, in some fence of the document.

    ``facets.node_ids`` is already the union across fences, so the same check serves a
    styling fix that edits one fence and a complexity fix that splits it into several.
    """
    missing = facets.node_ids(seed) - facets.node_ids(output.read(target))
    assert not missing, f"{len(missing)} node(s) of the fixture are gone from {target}: {sorted(missing)[:20]}"


# -- erDiagram extractors ---------------------------------------------------------------

_ENTITY_BLOCK = re.compile(r"^\s*([A-Za-z][\w-]*)\s*\{", re.MULTILINE)
_RELATIONSHIP = re.compile(r"^\s*([A-Za-z][\w-]*)\s+([|}o][|o](?:--|\.\.)[|o][|{o])\s+([A-Za-z][\w-]*)", re.MULTILINE)


def entities(doc: str) -> set[str]:
    """Every entity an ``erDiagram`` declares, by attribute block or by relationship."""
    out: set[str] = set()
    for body in facets.fences(doc):
        out.update(_ENTITY_BLOCK.findall(body))
        for left, _, right in _RELATIONSHIP.findall(body):
            out.update((left, right))
    return out - {"erDiagram"}


def relationships(doc: str) -> set[str]:
    """Every relationship as ``LEFT <cardinality> RIGHT``: the data model's shape."""
    return {f"{a} {card} {b}" for body in facets.fences(doc) for a, card, b in _RELATIONSHIP.findall(body)}
