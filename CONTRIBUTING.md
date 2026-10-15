# Contributing

How to set up `jpai-mermaidjs-lint`, make a change, and get it accepted.

## Setup

This repo is a bun project with a uv side for tooling.
The bun side is the package itself, and the uv side renders the decision bundle and builds the docs site.

```sh
make install   # uv sync, then bun install
```

## Making a change

```sh
make fix       # biome autofix, then regenerate the ADR bundle
make check     # typecheck, coverage, docs-ci and lint, with Bun alone, as GitHub Actions runs it
make build     # bundle src into dist for Node, which git ignores
make test      # build, then run the test suite once
make ci        # fix, typecheck, coverage gate, then assert the tree is clean
make docs-ci   # gate every markdown file with this repo's own source
make site      # generate the reference pages, then build the docs site in strict mode
make site-serve  # the same, served locally with live reload
```

`dist/` holds the Node bundles and is never committed.
The test targets rebuild it first, so the Node tests never run a stale bundle.

Both `make ci` and `make docs-ci` must pass before a change is accepted.
The coverage gate fails below 90% aggregate for functions or lines.

## Adding a rule

1. Write one module in `src/rules` exporting a `Rule`, named for its id.
2. Add its id to `RULE` in `src/rules/types.ts`, and register it in `src/rules/index.ts`.
3. Add its section and examples to `RULES.md`, which `tests/rules-doc.test.ts` holds to the code.
4. Add tests that run the real parser over real strings.

A rule that rewrites text needs an expectation from the verifier, and an adversarial test for every case it refuses.

## Adding a fixture

A diagram that misbehaves in the wild becomes a fixture: one file under `tests/fixtures`, with an expect comment naming the rules it must report.
[tests/fixtures/README.md](tests/fixtures/README.md) has the format.
The test suite and the docs site both pick it up, with no code to write.

## Landing a change

Main is protected once the first version is published.
Every change lands through a pull request, and nobody pushes to main directly.

```sh
git switch -c <short-topic>
git push -u origin <short-topic>
gh pr create --fill
```

A pull request merges once Check (Node 20) and Check (Node 24) pass on its latest commit.

## Recording a decision

A binding decision is recorded as a new `.yml` record in `adrs/` in the same change that makes it.
Copy the shape of an existing record, give it the next number, and keep the `MJL-` prefix.
Every typed relation needs its back-edge in the target record.
Run `make fix` to validate the record and regenerate the bundle.

## Publishing a release

Releases go through the Publish workflow in GitHub Actions.
[docs/PUBLISHING.md](docs/PUBLISHING.md) has the speed run and the one-time setup.

## Commit messages

Explain the change and the reason for it, not the mechanics of the diff.
A commit that changes a generated file includes the source change that produced it.
