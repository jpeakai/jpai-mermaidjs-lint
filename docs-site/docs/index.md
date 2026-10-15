<div class="ml-hero" markdown>

# mermaidjs-lint

<p class="ml-lede">Lint the Mermaid diagrams in your markdown, and fix what can be fixed safely.</p>

[Get started](get-started.md){ .md-button .md-button--primary } [Browse the rules](reference/rules.md){ .md-button }

</div>

## The four tenets

Every rule and every design choice serves one of four tenets.
Three tenets are guarantees about every diagram the tool passes, and the fourth is a commitment about the tool.

--8<-- "tenets.md"

The [contrast](reference/rules.md#contrast), [parse](reference/rules.md#parse) and [complexity](reference/rules.md#complexity) rules deliver the first three, and [the plugin model](concepts/plugin-model.md) delivers the fourth.
[Concepts](concepts/index.md) states the limit of each.

Where a fix is safe, `--fix` writes it and parses the document again.
It keeps the fix only when the markdown around the diagrams is unchanged, and each diagram keeps its type, node ids, subgraph names and counts:

--8<-- "home-compare.md"

The check does not compare edge endpoints, edge labels or node text, so review the diff a fix writes.

## Install

Run these in a project that has a `package.json`, then name your own markdown files and folders.

=== "Bun"

    ```sh
    bun add --dev @jpeakai/mermaidjs-lint
    bunx mermaidjs-lint docs/
    ```

=== "npm"

    ```sh
    npm install --save-dev @jpeakai/mermaidjs-lint
    npx mermaidjs-lint docs/
    ```

Every path you name must exist, or the run stops with a usage error and exit 2.
The run exits 1 while any finding remains, so it works as a gate in CI with no extra flags.
[Get started](get-started.md) begins from an empty folder.

!!! info "Which version these pages describe"

    This site is built from the `main` branch.
    A feature on `main` but not yet on npm is listed under `Unreleased` in the [changelog](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/CHANGELOG.md).
    `mermaidjs-lint --version` prints the version you run.

## Where to go next

<div class="grid cards" markdown>

- :material-rocket-launch: **[Get started](get-started.md)**

    Lint a file, read a finding, fix it, and add the check to your project.

- :material-hammer-wrench: **[Guides](guides/index.md)**

    Gate CI, configure the rules, lint a MkDocs site, and write rules of your own.

- :material-lightbulb-on: **[Concepts](concepts/index.md)**

    How a run works, how plugins load, and why contrast and complexity are measured the way they are.

- :material-book-open-variant: **[Reference](reference/index.md)**

    Every rule, flag, config key, and the types a rule receives.

</div>

## What it does not do

- **It does not draw diagrams.** "Renders" means the mermaid parsers this package ships accept the diagram, so a diagram that parses but draws badly is not caught.
- **It does not know your host's mermaid version.** A host on an older mermaid may fail to draw a diagram type that parses here.
- **It does not score unstyled nodes or theme settings.** Only the colours a diagram declares are scored, and [Contrast profiles](concepts/contrast.md#what-is-not-scored) lists what is left out.
- **It does not walk build or vendor folders.** A directory walk skips dot-folders and any folder named `node_modules`, `vendor`, `dist`, `build`, `tmp` or `__pycache__`, at any depth. Name such a file directly to check it.
- **It does not see a diagram inside another fence.** A mermaid fence after an unclosed fence of another language is read as that fence's code.
- **It has no per-diagram suppression.** A rule is on for every diagram or off for all of them, and [Troubleshooting](guides/troubleshooting.md) gives the workarounds.
- **It does not split diagrams.** A complexity finding names the subgraphs to split along, and a human or an LLM decides. The [fixture gallery](gallery/fixtures.md) shows what an LLM would do.
- **It does not choose colours.** A contrast fix only swaps a declared label colour for black or white, and only when that passes every background it is scored on.
- **It has no warnings.** Every finding fails the run, and a rule you do not want is switched off in the config.

## Project

| Topic | Where |
|---|---|
| Report a bug or ask a question | [GitHub issues](https://github.com/jpeakai/jpai-mermaidjs-lint/issues), with the output of `mermaidjs-lint --version` |
| Report a vulnerability, and the plugin trust model | [SECURITY.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/SECURITY.md) |
| What counts as a breaking change | [Versioning](reference/index.md#versioning) |
| What changed in each release, and what is not yet released | [CHANGELOG.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/CHANGELOG.md) |
| Lint and fix diagrams from an AI coding agent | The [agent skill](https://github.com/jpeakai/jpai-mermaidjs-lint/tree/main/skills/mermaidjs-lint), installed as the [README](https://github.com/jpeakai/jpai-mermaidjs-lint#use-it-from-an-ai-agent) shows, and its [evals](gallery/agent-evals.md) |
| Licence | MIT, in [LICENSE](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/LICENSE) |
| Contributing | [CONTRIBUTING.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/CONTRIBUTING.md) |
