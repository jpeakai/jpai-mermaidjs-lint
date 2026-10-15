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
          - run: bunx --bun --no-install mermaidjs-lint README.md docs/
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
          - run: npx --no-install mermaidjs-lint README.md docs/
    ```

The step fails while any finding remains, which fails the check.

- **Name your own paths.** Replace `README.md docs/` with the files and folders that hold your diagrams. A path that does not exist stops the run with exit code 2.
- **Keep `--no-install`.** It runs only the copy the install step put in `node_modules`. Without it, a project that does not declare the package makes the runner fetch the unscoped name `mermaidjs-lint`, which this project does not own.
- **Keep `--bun` in the Bun workflow.** The installed command starts on the runner's Node, even under `bunx`. `--bun` runs it on Bun, which a [TypeScript local rule](local-rule.md#go-further) needs unless Node is 22.18 or newer (23.6 or newer on Node 23).
- **Use another CI service the same way.** Install the dependencies, then run the same command. Exit code 1 fails the job on any CI service.

## Read the result

| Exit code | Meaning |
|---|---|
| 0 | No findings |
| 1 | Findings remain, a plugin failed to load in a run that is not lenient, or the run failed |
| 2 | A usage error, such as an unknown flag or a bad config file |

Each finding prints as `file:line rule message`, so the log points straight at the diagram.
Add `--json` when another tool consumes the result: each finding carries a `remediation` with the next step when the rule gives one.

## Know what a fork can run

A plugin is code that runs in your CI job, and so is every install script of your dependencies.
On a `pull_request` from a fork, the workflow file and the lockfile come from the fork, so a fork can remove any flag you add.
The boundary is the job itself: keep the `pull_request` trigger, which runs with a read-only token and no secrets.
Never run this check under `pull_request_target` with a checkout of the pull request's code.
That trigger runs with the base repository's secrets and a write token, so fork code would run with both.
`--no-plugins` does not add a boundary here, because installing the dependencies already ran their code.
[SECURITY.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/SECURITY.md) has the full trust model.

## Run the built-in rules only

`--no-plugins` loads no plugin, which gives a baseline run with the built-in rules.
A config setting for a plugin rule is set aside in that run, and standard error says so:

```text
mermaidjs-lint: plugins off; skipped mermaidjs-lint-plugin-acme
mermaidjs-lint: ignored config setting for acme/acme-direction, whose plugin did not load
```

Version 0.1.1 does not set the setting aside, and fails the run with `error[unknown-rule]` instead.

## Fix before you push

Run the same command with `--fix` locally to apply every fix the tool can prove safe.
A [pre-commit hook](pre-commit.md) does this for each commit.
CI should not run `--fix`: a gate that rewrites files hides the finding it exists to report.
