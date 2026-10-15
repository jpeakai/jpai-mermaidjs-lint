# Gate diagrams in CI

Fail a pull request when it adds a diagram that does not parse, is too complex, or cannot be read.

**Before you begin:** the package is a dev dependency, as in [Get started](../get-started.md).

## Add the workflow

Create `.github/workflows/diagrams.yml`:

=== "Bun"

    ```yaml
    name: Diagrams

    on:
      pull_request:

    jobs:
      lint:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v6
          - uses: oven-sh/setup-bun@v2
          - run: bun install --frozen-lockfile
          - run: bunx mermaidjs-lint README.md docs/
    ```

=== "npm"

    ```yaml
    name: Diagrams

    on:
      pull_request:

    jobs:
      lint:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v6
          - uses: actions/setup-node@v6
            with:
              node-version: "24"
          - run: npm ci
          - run: npx mermaidjs-lint README.md docs/
    ```

The step fails while any finding remains, which fails the check.

## Read the result

| Exit code | Meaning |
|---|---|
| 0 | No findings |
| 1 | Findings remain, a plugin failed to load, or the run failed |
| 2 | A usage error, such as an unknown flag or a bad config file |

Each finding prints as `file:line rule message`, so the log points straight at the diagram.
Add `--json` when another tool consumes the result: each finding then carries a `remediation` with the next step.

## Keep untrusted code out

A plugin is code that runs in your CI job.
On workflows that run for pull requests from forks, add `--no-plugins` to run the built-in rules only.

## Fix before you push

Run the same command with `--fix` locally to apply every fix the tool can prove safe.
CI should not run `--fix`: a gate that rewrites files hides the finding it exists to report.
