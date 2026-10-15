# Evals

Live agent evals for the `mermaidjs-lint` skill, run by the [`pytest-xharness-eval`](https://github.com/neozenith/pytest-xharness-eval) pytest plugin.
Each case runs the `claude` and `codex` CLIs headlessly against a fixture workspace, then grades what the agent left behind.

The question every case asks: given the linter, does an agent actually fix a failing diagram?
The plugin is a dev dependency of this repository, so `uv run pytest` picks it up.

| Path | What it checks |
|------|----------------|
| `eval_label_colour.py` | A fill with no label colour gets one that clears 4.5:1 |
| `eval_border_contrast.py` | A border that vanishes on its fill gets a stroke that clears 3:1 |
| `eval_erd_contrast.py` | An unreadable `erDiagram` entity is fixed with a stroke, not the flowchart recipe |
| `eval_parse_repair.py` | A diagram that does not parse is repaired rather than deleted |
| `eval_nesting.py` | Subgraphs nested three deep are flattened without losing the edge inside |
| `eval_large_chain.py` | A chain over the node limit is split into parts that together keep every node |
| `_lint.py` | The shared verdict: this repository's linter, and the structure checks |
| `fixtures/<name>/` | The seed workspace each cell starts from |

## How a cell is graded

Every case runs the same steps, in this order:

1. **Evidence.** The run is real and priced (`check_rollout`).
2. **Scope.** The fixture file was edited in place, and nothing else was added beyond a tool cache.
3. **Fixed, not deleted.** The fence count did not drop, and every node id the fixture declares is still drawn. For the split case that is the union across fences.
4. **Structure against a golden.** Each fixture is seeded from a rule fixture in `tests/fixtures/rules/`, and its committed `.llm.md` sibling is the golden. Only structure is compared, because the colours and split points are the agent's to choose.
5. **The linter is clean.** The agent's file is linted with this repository's `src/bin.ts`, never a published copy, and must report 0 findings.

Zero findings alone is not the verdict.
Deleting the fence also reaches zero, which is why step 3 comes first.

## Prerequisites

- `claude` and `codex` on your `PATH`, each logged in.
- `bun` on your `PATH`, with `bun install` run, for the grader's lint step.
- Network access to the npm registry from the agent's sandbox, since the skill runs the linter through `bunx` or `npx`.

## Run

Run from the repository root.
A bare `pytest` never collects these, so the path is required.

Preview the matrix first. Nothing is invoked and nothing is billed:

```sh
make evals-dry
```

The dry run writes its report to `tmp/evals-dry/report/report.json`, so the last live run's report in `.xharness_eval_cache/` stays as it was.

Then run it live. **Every cell is a billed agent session.**

```sh
make evals
```

Narrow the spend with `ARGS`, which passes `--harness claude|codex`, `--model <substring>` or `-k <expr>` through:

```sh
make evals ARGS="--harness claude -k label_colour"
```

Session logs and a browsable report land in `.xharness_eval_cache/` at the repository root, which is git-ignored.

## Changing a fixture

A fixture is a copy of a rule fixture with its `<!-- expect: ... -->` line removed, so the agent is not handed the answer.
When a rule fixture changes, copy it again, and check that its `.llm.md` sibling still passes the linter.
