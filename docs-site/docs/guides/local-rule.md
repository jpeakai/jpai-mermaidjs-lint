# Write a local rule

Add a rule for one project as a single file, with no package to publish.
This guide builds a rule that reports a `TODO` left in a diagram.

**Before you begin:** the package is a dev dependency, as in [Get started](../get-started.md).
The short command `mermaidjs-lint` below works only then.

## Create the rule file

Create `.mermaidjs-lint/rules/house-no-todo.mjs` at the project root:

```js
export const categories = { house: "Our house style" };

export default {
  category: "house",
  summary: "a TODO left in a diagram",
  check: ({ doc }) =>
    doc.diagrams
      .filter((d) => d.source.includes("TODO"))
      .map((d) => ({ line: d.startLine, endLine: d.endLine, message: "TODO left in a diagram" })),
};
```

The file name is the rule key, and it must start with the rule's category, as `category-short-name`.
Each key comes from exactly one file, so two files such as `house-x.js` and `house-x.mjs` fail the load with `error[plugin-contract]`, naming both.
The `categories` export declares `house` as a new category, because a TODO is a house-style choice.
Keep the built-in categories, `parse`, `complexity` and `contrast`, for what those words mean.
The rule loads on its own, with the id `local/house-no-todo`.

## Run it

Create `docs/flow.md` holding a diagram with a TODO comment:

````markdown
```mermaid
flowchart TD
  %% TODO name the queue
  A --> B
```
````

```sh
bunx mermaidjs-lint docs/
```

```text
mermaidjs-lint: loaded local (1 rule)
docs/flow.md:1-5 local/house-no-todo TODO left in a diagram
1 finding(s) in 1 file(s)
```

## Test it

The `testing` entry point runs one rule over a string, with the same contract checks and fix engine as a real run.
It skips three load checks: the reserved `local` namespace, conflicts between plugins, and two rule files with one name.
Run `--validate-plugins` to catch those.

=== "Bun"

    Create `tests/house-no-todo.test.ts`:

    ```ts
    import { expect, test } from "bun:test";
    import { checkRule, localPlugin } from "@jpeakai/mermaidjs-lint/testing";
    import * as mod from "../.mermaidjs-lint/rules/house-no-todo.mjs";

    const plugin = localPlugin("house-no-todo", mod);

    test("reports a TODO in a diagram", async () => {
      const src = "```mermaid\nflowchart LR\n  %% TODO\n  A --> B\n```\n";
      const findings = await checkRule(plugin, "house-no-todo", src);
      expect(findings.map((f) => f.rule)).toEqual(["local/house-no-todo"]);
    });
    ```

    Run it with `bun test`.

=== "Node"

    Create `tests/house-no-todo.test.mjs`:

    ```js
    import assert from "node:assert/strict";
    import { test } from "node:test";
    import { checkRule, localPlugin } from "@jpeakai/mermaidjs-lint/testing";
    import * as mod from "../.mermaidjs-lint/rules/house-no-todo.mjs";

    const plugin = localPlugin("house-no-todo", mod);

    test("reports a TODO in a diagram", async () => {
      const src = "```mermaid\nflowchart LR\n  %% TODO\n  A --> B\n```\n";
      const findings = await checkRule(plugin, "house-no-todo", src);
      assert.deepEqual(findings.map((f) => f.rule), ["local/house-no-todo"]);
    });
    ```

    Run it with `node --test tests/house-no-todo.test.mjs`.

Either route reports one passing test.

## Go further

- **Add a fixer** by returning edits from a `fix` function. Each edit must declare what stays the same, and the engine refuses any edit that breaks it. See [Plugin API](../reference/plugin-api.md#edits).
- **Write it in TypeScript** as `.mts` or `.ts`. The command starts on Node even under `bunx`, so run `bunx --bun mermaidjs-lint docs/` to use Bun, or use Node 22.18 or newer. Anything else fails with `error[plugin-source]`.
- **Prefer `.mjs` and `.mts` to `.js` and `.ts`.** Under Node, a `.js` or `.ts` rule in a project without `"type": "module"` prints a `MODULE_TYPELESS_PACKAGE_JSON` warning on every run.
- **Check every rule loads** with `bunx mermaidjs-lint --validate-plugins`.
