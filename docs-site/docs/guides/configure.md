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
    "complexity-node-count-cognitive-limit": ["error", { "nodeHardLimit": 80 }],
    "complexity-node-count-hard-limit": ["error", { "nodeHardLimit": 80 }],
    "contrast-text-below-aa": ["error", { "profile": "github" }]
  }
}
```

Each rule declares the options it accepts and their types, and a config that breaks them fails before any file is read.
[Config file](../reference/configuration.md) lists every option.

A threshold is the boundary between two bands, so the two rules either side of it both read it.
Set it on both rules that read it, or a diagram between the old and new values reports two bands at once.
`nodeHardLimit` is read by the cognitive-limit and hard-limit rules, as in the example, where a diagram of 90 nodes reports the hard limit only.
[Rule settings](../reference/configuration.md#rule-settings) names the rules that read each threshold.

## Know which setting wins

A rule takes each setting from the first of these that gives one:

1. A threshold option on the rule in the config, such as `nodeHardLimit`.
2. The `--preset` or `--profile` flag.
3. The `preset` or `profile` option on the rule in the config.
4. The default, which is the `high-density` preset and the `auto` profile.

So `--preset low` overrides a configured `preset`, and a configured `nodeAcceptable` overrides both.
[Precedence](../reference/cli.md#precedence) states the same order.

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

A `.mjs` config is code that runs on every check.
A `--no-plugins` run refuses to import it and stops with `error[config-code]`, so prefer `.json` unless you need code.
Version 0.1.1 imports a `.mjs` config even under `--no-plugins`.
