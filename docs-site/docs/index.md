<div class="ml-hero" markdown>

# mermaidjs-lint

<p class="ml-lede">Lint the Mermaid diagrams in your markdown, and fix what can be fixed safely.</p>

[Get started](get-started.md){ .md-button .md-button--primary } [Browse the rules](reference/rules.md){ .md-button }

</div>

`mermaidjs-lint` reads every diagram with mermaid's own parsers.
It fails a diagram that will not parse, one too complex to follow, or one whose labels cannot be read against their fills.
Where a fix is safe, `--fix` writes it, parses the document again, and keeps it only when nothing else changed.

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

- **It does not render.** It reads structure from mermaid's parsers, so a diagram that parses but draws badly is not caught.
- **It does not split diagrams.** A complexity finding names the subgraphs to split along, and a human decides.
- **It does not choose colours.** A contrast fix only swaps a declared label colour for black or white, and only when that passes every background it is scored on.
- **It has no warnings.** Every finding fails the run, and a rule you do not want is switched off in the config.
