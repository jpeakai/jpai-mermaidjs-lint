# Publish a plugin package

Share rules between projects as an npm package that loads on its own once installed.

**Before you begin:** a [local rule](local-rule.md) is the faster way to try an idea in one project.

## Name the package

Name it `mermaidjs-lint-plugin-<name>`, or `@scope/mermaidjs-lint-plugin-<name>`.
A project loads it when it lists the package in `dependencies`, `devDependencies` or `optionalDependencies`.

## Write package.json

Start the package in a new folder, with this `package.json`:

```json
{
  "name": "mermaidjs-lint-plugin-acme",
  "version": "1.0.0",
  "type": "module",
  "exports": "./index.js",
  "files": ["index.js"],
  "peerDependencies": {
    "@jpeakai/mermaidjs-lint": "^0.6.1"
  },
  "devDependencies": {
    "@jpeakai/mermaidjs-lint": "^0.6.1"
  }
}
```

- **`"type": "module"`** marks `index.js` as an ES module. Without it, Node reparses the file, and warns on every run while you test the package through a link.
- **`exports`** names the file the linter imports.
- **`peerDependencies`** says which linter versions the plugin works with, and uses the project's own copy.
  The range starts at 0.6.1, the first release where a `canvas` option under another name receives the canvas flags.
  Before it, only an option named `canvas` received them.
  Under 0.x a caret range accepts only patch releases, so `^0.6.1` matches 0.6.5 but not 0.7.0.
  Each 0.x minor may change the plugin contract, so widen the range only after testing the next minor, for example to `>=0.6.1 <0.8.0`.
- **`devDependencies`** installs the linter, so the plugin's tests can run.

## Export the plugin

The package's default export, in `index.js`, is the plugin: its metadata and its rules.

```js
const FLOWCHART = new Set(["flowchart", "graph"]);

export default {
  meta: { name: "acme", namespace: "acme", apiVersion: 1, categories: { acme: "Acme house style" } },
  rules: {
    "acme-direction": {
      category: "acme",
      summary: "a flowchart that does not read in the house direction",
      options: { direction: "string" },
      check: ({ doc, options }) => {
        const direction = options.direction ?? "LR";
        const wanted = new RegExp(`^(flowchart|graph)\\s+${direction}\\b`, "m");
        return doc.diagrams
          .filter((d) => FLOWCHART.has(d.keyword) && !wanted.test(d.source))
          .map((d) => ({ line: d.startLine, endLine: d.endLine, message: `flowcharts in Acme docs read ${direction}` }));
      },
    },
  },
};
```

- **`namespace`** prefixes every rule id, so this rule runs as `acme/acme-direction`. It must be lower-case and cannot be `local`.
- **`apiVersion`** must match the version the tool implements, which is `1`.
- **`categories`** declares any new category word the rules use, and each rule key starts with its category word. A built-in category needs no declaration.
  A category word is global, so no other plugin or local rule in the project may declare it, as [the plugin model](../concepts/plugin-model.md#namespaces-and-categories-are-global) explains.
  This guide uses `acme` because [Write a local rule](local-rule.md) already declares `house`.
- **`options`** declares each option the rule accepts, as a name mapped to one of the types in [PluginRule](../reference/plugin-api.md#pluginrule), such as `number` or `canvas`. The rule reads them from `options`.

A flowchart opens with either `flowchart` or `graph`, so the rule checks both keywords.

## Test it

The `testing` entry point runs one rule over a string, with the same contract checks and fix engine as a real run.
It skips two load checks: the reserved `local` namespace, and conflicts between plugins.
Run `--validate-plugins` in a project to catch those.
Create `test/acme-direction.test.js`:

```js
import { expect, test } from "bun:test";
import { checkRule } from "@jpeakai/mermaidjs-lint/testing";
import plugin from "../index.js";

const graphTopDown = "```mermaid\ngraph TD\n  A --> B\n```\n";

test("reports a graph that reads top down", async () => {
  const findings = await checkRule(plugin, "acme-direction", graphTopDown);
  expect(findings.map((f) => f.rule)).toEqual(["acme/acme-direction"]);
});

test("takes the direction from its options", async () => {
  const findings = await checkRule(plugin, "acme-direction", graphTopDown, { options: { direction: "TD" } });
  expect(findings).toEqual([]);
});
```

Run `bun install`, then `bun test`, and both tests pass.
On Node, write the same tests with `node:test`, as [Write a local rule](local-rule.md#test-it) shows.

## Publish it

Check what the package will ship, then publish it:

=== "Bun"

    ```sh
    bun pm pack --dry-run
    bun publish
    ```

=== "npm"

    ```sh
    npm pack --dry-run
    npm publish
    ```

The dry run lists `package.json` and `index.js`, and nothing else.
A scoped name needs `--access public` on its first publish.

## Install it in a project

In a project that uses the linter, add the plugin as a dev dependency:

```sh
bun add --dev mermaidjs-lint-plugin-acme
```

Then check it loads, with the linter installed in the project:

```sh
bunx --no-install mermaidjs-lint --validate-plugins
```

```text
mermaidjs-lint: plugins valid: acme (1 rule)
```

`--list-rules` then shows the rule under its category, and where it came from.

## Let users configure it

A plugin rule is switched off, or given options, exactly like a built-in:

```json
{ "rules": { "acme/acme-direction": ["error", { "direction": "TD" }] } }
```

The config is checked against the rule's `options` before any file is read.
A wrong type, such as `"direction": 3`, stops the run with `error[rule-option]`.

## When a load fails

A run stops with `error[code]`, naming the source and the reason.
[Plugin API](../reference/plugin-api.md#load-errors) lists the codes.
Users can pass `--lenient-plugins` to skip a broken plugin and carry on.
