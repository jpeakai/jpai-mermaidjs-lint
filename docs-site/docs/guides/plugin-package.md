# Publish a plugin package

Share rules between projects as an npm package that loads on its own once installed.

**Before you begin:** a [local rule](local-rule.md) is the faster way to try an idea in one project.

## Name the package

Name it `mermaidjs-lint-plugin-<name>`, or `@scope/mermaidjs-lint-plugin-<name>`.
A project loads it when it lists the package in `dependencies`, `devDependencies` or `optionalDependencies`.

## Export the plugin

The package's default export is the plugin: its metadata and its rules.

```js
export default {
  meta: { name: "acme", namespace: "acme", apiVersion: 1, categories: { house: "Acme house style" } },
  rules: {
    "house-left-to-right": {
      category: "house",
      summary: "a flowchart that does not read left to right",
      check: ({ doc }) =>
        doc.diagrams
          .filter((d) => d.keyword === "flowchart" && !/^flowchart\s+LR/m.test(d.source))
          .map((d) => ({ line: d.startLine, endLine: d.endLine, message: "flowcharts in Acme docs read left to right" })),
    },
  },
};
```

- **`namespace`** prefixes every rule id, so this rule runs as `acme/house-left-to-right`. It must be lower-case and cannot be `local`.
- **`apiVersion`** must match the version the tool implements, which is `1`.
- **`categories`** declares any new category word the rules use. A built-in category needs no declaration.

## Check it loads

In a project that depends on the package:

```sh
bunx mermaidjs-lint --validate-plugins
```

```text
mermaidjs-lint: plugins valid: acme (1 rule)
```

`--list-rules` then shows the rule under its category, and where it came from.

## Let users configure it

A plugin rule is switched off, or given options, exactly like a built-in:

```json
{ "rules": { "acme/house-left-to-right": "off" } }
```

To accept options, declare them on the rule as names mapped to `number`, `string`, `boolean` or `string[]`.
Read them from `ctx.options`.
The config is checked against that declaration before any file is read.

## When a load fails

A run stops with `error[code]`, naming the source and the reason.
[Plugin API](../reference/plugin-api.md#load-errors) lists the codes.
Users can pass `--lenient-plugins` to skip a broken plugin and carry on.
