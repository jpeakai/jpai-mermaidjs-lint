# Gallery

Real files, drawn as this site renders them, with what the linter reports for each.
The fixture and example pages are generated from files in the repository, and the site build fails if any of them stops behaving as recorded.

| Page | What it shows |
|---|---|
| [Fixtures](fixtures.md) | The test corpus: one file per behaviour, clean files, and larger scenario files, each with the fix an LLM would make where `--fix` leaves findings |
| [Layout examples](examples.md) | Layouts, looks and icon packs, each linted clean |
| [Agent evals](agent-evals.md) | Whether AI coding agents, given this linter, can fix the fixtures `--fix` cannot clear |

A diagram that misbehaves becomes a fixture by adding one file, as [the fixtures README](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/tests/fixtures/README.md) describes.
