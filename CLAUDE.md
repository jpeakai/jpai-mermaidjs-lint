# CLAUDE.md

Operating instructions for agents working in `jpai-mermaidjs-lint`, the deterministic Mermaid diagram gates and their fixers.

Read [docs/CONVENTIONS.md](docs/CONVENTIONS.md) before creating, moving or renaming any document.
It is the declared dialect and it outranks any general convention.

## Commands

```sh
make fix       # biome autofix, then regenerate the ADR bundle
make check     # the gate GitHub Actions and npm publish run, with no private tooling
make ci        # fix, typecheck, tests at 90% coverage, then assert the tree is clean
make docs-ci   # run the prose gates and the diagram gates over every markdown file
```

## Decisions

Accepted decisions live in [`adrs/`](adrs/), covering how the gates parse, fix and verify.
Check them before raising an open question, and self-answer from an existing record where one applies.
Record a new binding decision as a new `.yml` record in the same change that makes it.
An accepted record is never rewritten, and a later decision supersedes it through a typed relation.

## Language

[GLOSSARY.md](GLOSSARY.md) is the canonical vocabulary for this repo.
Use its terms for every identifier, filename and piece of prose, never an ad-hoc synonym.
When a new domain term enters the code or the conversation, add it to the glossary in the same change.

## Never

- Never edit a generated file.
  Everything in `adrs/` except the `.yml` records is generated.
  So is `dist/`, which `make build` bundles from `src/` for Node and git ignores.
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
- Never fix a fix bug without first adding the adversarial test that reproduces it.
- Never use a Bun global in `src/`.
  The Node bundle must run without Bun.
- Never use mocks in tests.
  Tests run the real parsers over real strings and files.
- Never push to main once the first version is out.
  Every change lands through a pull request that passes CI.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md) for setup and how a change is accepted.
- [README.md](README.md) for what this repo is and what it contains.
