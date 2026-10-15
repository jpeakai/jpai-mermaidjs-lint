# Configure the rules

Switch a rule off, change the complexity preset, or pass options to a rule.
Everything works with no config file, so add one only when a default does not suit you.

## Create the config file

Put `mermaidjs-lint.config.json` at the project root:

```json
{
  "rules": {
    "contrast-directive-unauditable": "off"
  }
}
```

The project root is found by searching upwards from where you run the command.
It is the first folder holding a `package.json`, a config file or a `.mermaidjs-lint` folder, or the working directory when none does.
A config somewhere else is read with `--config path/to/file.json`.

A rule id that does not exist fails the run with `error[unknown-rule]`, so a misspelt id never silently does nothing.

## Switch a rule off

Set its id to `"off"`, as above.
There is no warning level: a rule is either on and failing the run, or off.

## Change the complexity preset

Pass `--preset` to set the density for every complexity rule at once:

```sh
bunx mermaidjs-lint --preset low docs/
```

The presets are `low-density`, `medium-density` and `high-density`, with the short aliases `low`, `medium` and `high`.
[Flags](../reference/cli.md#flags) lists every alias, and [Measuring complexity](../concepts/complexity.md) lists the thresholds.

!!! warning "Set the preset for the whole ladder"

    Each complexity rule covers one band of a ladder.
    Setting `preset` on one rule in the config moves only that band, which can leave a gap where no rule fires.
    Use `--preset`, or set the same preset on every complexity rule.

## Pass options to a rule

Give the rule a pair of severity and options:

```json
{
  "rules": {
    "complexity-node-count-hard-limit": ["error", { "nodeHardLimit": 80 }],
    "contrast-text-below-aa": ["error", { "profile": "github" }]
  }
}
```

Each rule declares the options it accepts and their types, and a config that breaks them fails before any file is read.
[Config file](../reference/configuration.md) lists every option.

## Use JavaScript for the config

Name the file `mermaidjs-lint.config.mjs` and export the same object as the default:

```js
export default {
  rules: {
    "contrast-directive-unauditable": "off",
  },
};
```

A project holds one config file, so having both a `.json` and a `.mjs` file is an error.
