# CLAUDE.md

Operating instructions for agents working in `jpai-mermaidjs-lint`, the deterministic Mermaid diagram gates and their fixers.

Read [docs/CONVENTIONS.md](docs/CONVENTIONS.md) before creating, moving or renaming any document.
It is the declared dialect and it outranks any general convention.

## The four tenets

Every change serves one of these, per [MJL-0015](adrs/0015-four-tenets-define-the-tool.md).
A rule or feature that serves none of them does not belong.
Three tenets are guarantees about every diagram the tool passes, and the fourth is a commitment about the tool.

- **Always readable in light mode or dark mode.** Declared fills, label colours and borders are scored as the host draws them, on nodes, erDiagram rows, edge labels and sequence diagrams, in both themes.
- **It actually renders a valid diagram.** Every diagram parses with the mermaid parsers this package ships, and every mermaid fence is closed.
- **Visual Complexity stays readable.** Node count and visual complexity are scored against a density preset, so an oversized diagram is flagged to be split.
- **Make your own rules.** A plugin adds rules of your own, which run through the same config, fix engine and verification as the built-ins.

Never reword a tenet in one place.
Change `docs-site/includes/tenets.md`, then the same line in `README.md`, `CONTRIBUTING.md` and here, as `tests/tenets.test.ts` asserts.
The framing sentence above the list is repeated word for word in `CONTRIBUTING.md` and on the site's concepts page.

## Commands

```sh
make fix       # regenerate the ADR bundle, then biome autofix
make check     # the gate GitHub Actions and npm publish run, which only checks
make ci        # fix, typecheck, tests at 90% coverage, then docs-ci
make docs-ci   # run the prose gates and the diagram gates over every authored markdown file
make site      # generate and build the docs site in strict mode
```

## Decisions

Accepted decisions live in [`adrs/`](adrs/), covering how the gates parse, fix and verify.
Check them before raising an open question, and self-answer from an existing record where one applies.
Record a new binding decision as a new `.yml` record in the same change that makes it.
An accepted record is never rewritten, and a later decision supersedes it through a typed relation.
The one allowed edit is appending the back-edge of a new record's typed relation, per [MJL-0016](adrs/0016-a-back-edge-may-be-appended-to-an-accepted-record.md).

## Language

[GLOSSARY.md](GLOSSARY.md) is the canonical vocabulary for this repo.
Use its terms for every identifier, filename and piece of prose, never an ad-hoc synonym.
When a new domain term enters the code or the conversation, add it to the glossary in the same change.

## Never

- Never edit a generated file.
  Everything in `adrs/` except the `.yml` records, `okf_render.py`, `record.schema.json` and `templates/` is generated.
  Fix generated ADR prose in its record or its template.
  So is `dist/`, which `make build` bundles from `src/` for Node and git ignores.
  So are the docs site's rules page, its fixtures and examples gallery pages, and its snippets.
  `make site` writes them from `RULES.md`, `tests/fixtures`, `examples/` and the CLI help.
  The gallery's `index.md` and `agent-evals.md` are hand-written.
- Never let the docs describe unreleased behaviour without an `Unreleased` entry in `CHANGELOG.md`.
  The README on GitHub shows main, while the site and npm readers see the latest release.
- Never add a warning level.
  A finding fails the run or the rule is off, per [MJL-0003](adrs/0003-findings-fail-or-the-rule-is-off.md).
- Never let a fixer guess.
  An ambiguous case refuses and stays reported, per [MJL-0005](adrs/0005-a-fixer-refuses-when-unsure.md).
- Never add a fixer to a complexity rule.
  Splitting a diagram changes what it says, per [MJL-0004](adrs/0004-complexity-is-never-autofixed.md).
- Never count a diagram's structure from its text.
  Read mermaid's parser result, per [MJL-0001](adrs/0001-parse-with-mermaids-own-parsers.md).
- Never read thresholds from the environment, per [MJL-0010](adrs/0010-thresholds-are-options-not-environment.md).
- Never skip a plugin that fails to load.
  A bad plugin stops the run with its reason, unless the run is lenient.
- Never let a plugin edit bypass verification.
  A plugin fixer meets the same proof as a built-in one.
- Never describe fix verification as proving more than `src/fix/verify.ts` compares.
  It does not compare edge endpoints, labels or node text.
- Never fix a fix bug without first adding the adversarial test that reproduces it.
- Never use a Bun global in `src/`.
  The Node bundle must run without Bun.
- Never use mocks in tests.
  Tests run the real parsers over real strings and files.
- Never push to main.
  By convention every change lands through a pull request whose checks pass.
  Main is not protected, so nothing enforces this but the convention.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md) for setup and how a change is accepted.
- [README.md](README.md) for what this repo is and what it contains.
