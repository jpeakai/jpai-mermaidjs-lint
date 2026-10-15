# Agent evals

Can an AI coding agent, given this linter, actually fix a failing diagram?
These results answer that across agent harnesses and model tiers, for every fixture `--fix` cannot clear on its own.

## What a cell proves

Each cell runs one agent CLI, headless, on one failing fixture, with the [`mermaidjs-lint` agent skill](https://github.com/jpeakai/jpai-mermaidjs-lint/tree/main/skills/mermaidjs-lint).
The task is a single sentence: fix every finding the linter reports, editing the file in place.

A cell passes only when all of these hold:

- **The session was real.** The harness ran, and its own session log was captured and priced.
- **The right file changed, and nothing else appeared.** Linter caches are the only allowed additions.
- **The linter reports nothing.** This package's own CLI runs on the agent's file and finds zero findings.
- **Nothing was deleted to get there.** Every diagram and every node of the original is still present, so removing a diagram never passes.

The grader is deterministic: the verdict comes from the linter and the structure checks, never from another model.

## Results

Run on 2026-10-15 with the tier 2 and tier 3 model of each harness, the project matrix in `pyproject.toml`.

| Case | `claude/claude-sonnet-5-5` | `claude/claude-haiku-4-5-20251001` | `codex/gpt-5.6-terra` | `codex/gpt-6-luna` |
|---|---|---|---|---|
| `border_contrast` | pass, 4 turns | pass, 6 turns | pass, 5 turns | pass, 5 turns |
| `erd_contrast` | pass, 4 turns | pass, 6 turns | pass, 3 turns | pass, 3 turns |
| `label_colour` | pass, 3 turns | pass, 7 turns | pass, 8 turns | pass, 5 turns |
| `large_chain` | pass, 5 turns | pass, 8 turns | pass, 10 turns | pass, 5 turns |
| `nesting` | pass, 4 turns | pass, 6 turns | pass, 4 turns | pass, 5 turns |
| `parse_repair` | pass, 4 turns | pass, 9 turns | pass, 7 turns | pass, 5 turns |

Every cell passed.
The whole run cost an estimated $1.04.

## What the results do not show

- **They do not judge meaning.** A fix can lint clean and keep every node while changing what the diagram says, and no check here catches that.
- **They are one run.** An agent's output varies from run to run, so one pass is evidence, not a rate.
- **They cover only the failing fixtures.** Each case starts from one small file, not a real document set.

## Run them yourself

The suite uses the [`pytest-xharness-eval`](https://github.com/neozenith/pytest-xharness-eval) plugin, and needs the `claude` and `codex` CLIs on your `PATH`, each logged in.

Preview the matrix without spending anything:

```sh
make evals-dry
```

Run it live. Every cell is a billed agent session:

```sh
make evals
```

The suite's [README](https://github.com/jpeakai/jpai-mermaidjs-lint/tree/main/skills/mermaidjs-lint/evals) explains each case and its grader.
