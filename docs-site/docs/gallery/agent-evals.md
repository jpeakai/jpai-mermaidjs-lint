# Agent evals

Can an AI coding agent, given this linter, actually fix a failing diagram?
These results answer that across agent harnesses and model tiers, for the rule fixtures listed below that `--fix` cannot clear on its own.

## Which fixtures are evaluated

Each case seeds one file from `tests/fixtures/rules/`, copied into `skills/mermaidjs-lint/evals/fixtures/` without its expect comment.

| Case | Fixture |
|---|---|
| `border_contrast` | `contrast-border-reported.md` |
| `erd_contrast` | `contrast-text-unfixable-erd.md` |
| `label_colour` | `contrast-directive-no-color.md` |
| `large_chain` | `complexity-large-chain.md` |
| `nesting` | `complexity-nesting.md` |
| `parse_repair` | `parse-unparseable.md` |

Other fixtures that `--fix` cannot clear are not evaluated.
Those are `contrast-edge-label.md`, and the larger scenario files under `complexity/`, `contrast/` and `skill-evals/`.

## What a cell proves

Each cell runs one agent CLI, headless, on one failing fixture, with the [`mermaidjs-lint` agent skill](https://github.com/jpeakai/jpai-mermaidjs-lint/tree/main/skills/mermaidjs-lint).
The task is a single sentence: fix every finding the linter reports, editing the file in place.

A cell passes only when all of these hold:

- **The session was real.** The harness ran, and its own session log was captured and priced.
- **The right file changed, and nothing else appeared.** Linter caches are the only allowed additions.
- **The linter reports nothing.** This package's own CLI runs on the agent's file and finds zero findings.
- **Nothing was deleted to get there.** Every diagram and every node of the original is still present, so removing a diagram never passes.
- **The structure matches the committed LLM fix.** Each fixture's `.llm.md` sibling is the golden, and only structure is compared, because the colours and split points are the agent's to choose.

The grader is deterministic: the verdict comes from the linter and the structure checks, never from another model.

## Results

--8<-- "agent-eval-results.md"

## What each agent wrote

Each case shows its original fixture, then the file each harness and model left behind, copied from its kept workspace.
A passing output must lint clean, and the site build fails if one does not.

--8<-- "agent-eval-outputs.md"

## What the results do not show

- **They do not judge meaning.** A fix can lint clean and keep every node while changing what the diagram says, and no check here catches that.
- **They are one run.** An agent's output varies from run to run, so one pass is evidence, not a rate.
- **They cover only the fixtures listed.** Each case starts from one small file, not a real document set.

## Run them yourself

The suite uses the [`pytest-xharness-eval`](https://github.com/neozenith/pytest-xharness-eval) plugin, a dev dependency of this repository.
It needs:

- The `claude` and `codex` CLIs on your `PATH`, each logged in.
- `bun` on your `PATH`, with `make install` run, for the grader's lint step.
- Network access to the npm registry from each agent's sandbox, because the skill runs the linter through `bunx` or `npx`.

Preview the matrix without spending anything:

```sh
make evals-dry
```

The dry run writes its report to `tmp/evals-dry/report/report.json`, so the last live run's report in `.xharness_eval_cache/` stays as it was.

Run it live.
Every cell is a billed agent session:

```sh
make evals
```

Then copy the run onto this page, and rebuild the site:

```sh
make eval-outputs site
```

The suite's [README](https://github.com/jpeakai/jpai-mermaidjs-lint/tree/main/skills/mermaidjs-lint/evals) explains each case and its grader.
