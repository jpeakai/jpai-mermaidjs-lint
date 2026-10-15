<div class="ml-hero" markdown>

# mermaidjs-lint

<p class="ml-lede">Lint the Mermaid diagrams in your markdown, and fix what can be fixed safely.</p>

[Get started](get-started.md){ .md-button .md-button--primary } [Browse the rules](reference/rules.md){ .md-button }

</div>

## Four guarantees

Every rule and every design choice serves one of four tenets.

<div class="grid cards" markdown>

- :material-theme-light-dark: **Readable in light and dark**

    Every label can be read against its fill, in both light and dark themes.
    The [contrast rules](reference/rules.md#contrast) enforce it.

- :material-check-decagram: **Renders**

    Every diagram parses with mermaid's own parsers, the ones its renderer runs, and every fence is closed.
    The [parse rules](reference/rules.md#parse) enforce it.

- :material-chart-timeline-variant: **Simple enough to follow**

    Visual complexity is scored against a density preset, so an oversized diagram is flagged to be split.
    The [complexity rules](reference/rules.md#complexity) enforce it.

- :material-puzzle: **Extensible**

    A plugin system adds rules of your own, which load, run and fix exactly like the built-ins.
    [The plugin model](concepts/plugin-model.md) explains it.

</div>

Where a fix is safe, `--fix` writes it, parses the document again, and keeps it only when nothing else changed:

--8<-- "home-compare.md"

## Install

=== "Bun"

    ```sh
    bun add --dev @jpeakai/mermaidjs-lint
    bunx mermaidjs-lint README.md docs/
    ```

=== "npm"

    ```sh
    npm install --save-dev @jpeakai/mermaidjs-lint
    npx mermaidjs-lint README.md docs/
    ```

The run exits 1 while any finding remains, so it works as a gate in CI with no extra flags.

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

- **It does not draw diagrams.** "Renders" means mermaid's own parsers accept the diagram, so a diagram that parses but draws badly is not caught.
- **It does not split diagrams.** A complexity finding names the subgraphs to split along, and a human or an LLM decides. The [fixture gallery](gallery/fixtures.md) shows what an LLM would do.
- **It does not choose colours.** A contrast fix only swaps a declared label colour for black or white, and only when that passes every background it is scored on.
- **It has no warnings.** Every finding fails the run, and a rule you do not want is switched off in the config.
