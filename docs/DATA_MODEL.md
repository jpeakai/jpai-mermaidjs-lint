# Data model

The shapes `jpai-mermaidjs-lint` passes between its stages, read from the types in `src/`.
[ARCHITECTURE.md](ARCHITECTURE.md) shows the modules and the run that moves these shapes.

Each section opens with a simplified diagram and a one-sentence summary.
The full diagram, with every field, sits in a collapsible block beneath it.
Every entity is a type in the cited file, unless the section names it as a value inside a function.
The terms follow [GLOSSARY.md](../GLOSSARY.md).

The docs site draws parts of this model for consumers and plugin authors.
Its [document model](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/document-model/), [plugin model](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/plugin-model/) and [plugin API](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/plugin-api/) pages carry the same colours, and the site describes the latest release.

## Contents

- [The model at a glance](#the-model-at-a-glance)
- [Parsed document model](#parsed-document-model)
- [What is scored from a diagram](#what-is-scored-from-a-diagram)
- [Rule and finding model](#rule-and-finding-model)
- [Registry and config](#registry-and-config)
- [Fix model](#fix-model)
- [Plugin contract](#plugin-contract)
- [Plugin loading](#plugin-loading)

## The model at a glance

Every rule reads one document model, a check returns findings, a fixer returns edits, and the registry decides which rules run.

```mermaid
erDiagram
    Registry ||--o{ Rule : "rules"
    Config |o--|| Registry : "applied to"
    Plugin ||--o{ Rule : "adds"
    Rule }o--|| DocModel : "reads"
    DocModel ||--o{ Diagram : "diagrams"
    Rule ||--o{ Finding : "check returns"
    Rule ||--o{ Edit : "fix proposes"
    FixReport ||--o{ Edit : "applied or refused"

    classDef docTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef outTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class DocModel,Diagram docTint
    class Registry,Rule,Config ruleTint
    class Finding,Edit,FixReport outTint
    class Plugin pluginTint
```

<details>
<summary>The model at a glance, with the types between each pair (16 entities)</summary>

Sources: `src/model.ts`, `src/rules/types.ts`, `src/rules/registry.ts`, `src/config.ts`, `src/plugins/contract.ts` and `src/fix/engine.ts`.

```mermaid
erDiagram
    Config ||--o{ RuleSetting : "rules"
    RegistryInput }o--o| Config : "config"
    RegistryInput ||--|| Registry : "buildRegistry"
    Registry ||--o{ Rule : "rules and fixOrder"
    Registry ||--o{ LoadedSource : "sources"
    Plugin ||--o{ PluginRule : "rules"
    PluginRule ||--|| Rule : "toRule"
    Rule ||--o{ RuleContext : "receives per file"
    RuleContext }o--|| DocModel : "doc"
    DocModel ||--o{ Diagram : "diagrams"
    Diagram ||--o{ StyleDirective : "directives"
    Diagram ||--|| DiagramStats : "stats()"
    Rule ||--o{ Finding : "check returns"
    Rule ||--o{ Edit : "fix proposes"
    Edit ||--|| Expectation : "expect"
    FixReport ||--o{ Edit : "applied or refused"

    classDef docTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef outTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class DocModel,Diagram,StyleDirective,DiagramStats docTint
    class Config,RuleSetting,RegistryInput,Registry,LoadedSource,Rule,RuleContext ruleTint
    class Finding,Edit,Expectation,FixReport outTint
    class Plugin,PluginRule pluginTint
```

</details>

## Parsed document model

A file is parsed once to an mdast tree, and each mermaid fence in it becomes one diagram that every rule reads.

```mermaid
erDiagram
    DocModel ||--|| Root : "tree"
    Root ||--o{ Code : "mermaid fences"
    Code |o--|| Diagram : "becomes"
    DocModel ||--|{ Diagram : "diagrams"
    Diagram ||--o{ StyleDirective : "directives"
    Diagram ||--|| DiagramStats : "stats()"

    classDef docTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef diagramTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef styleTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    class DocModel,Root,Code docTint
    class Diagram,DiagramStats diagramTint
    class StyleDirective styleTint
```

<details>
<summary>Parsed document model, every field (7 entities)</summary>

Sources:

- `src/model.ts` for `DocModel` and `Diagram`.
- `src/parse/color.ts` for `StyleDirective` and `ValueSpan`.
- `src/parse/stats.ts` for `DiagramStats`.

`Root` and `Code` are mdast node types, built by `mdast-util-from-markdown` with the frontmatter and GFM extensions.

A raw diagram file has an empty `Root` and exactly one `Diagram`, so no `Code` node stands behind it.
A markdown file with no mermaid fence has no diagrams, so the diagram list may be empty there.

```mermaid
erDiagram
    DocModel ||--|| Root : "tree"
    Root ||--o{ Code : "fences with lang mermaid"
    Code |o--|| Diagram : "flattened to"
    DocModel ||--o{ Diagram : "diagrams, in document order"
    Diagram ||--o{ StyleDirective : "directives"
    StyleDirective ||--o{ ValueSpan : "spans, one per property"
    Diagram ||--|| DiagramStats : "stats(), parsed once on first use"

    DocModel {
        string src "the whole file"
        enum kind "markdown or diagram, from the extension"
        Root tree "empty for a raw diagram file"
        Diagram[] diagrams
    }
    Root {
        string type "root"
        Node[] children "the whole markdown tree"
    }
    Code {
        string lang "mermaid"
        string value "the fence body"
        Position position "start and end offsets"
    }
    Diagram {
        number index "position in diagrams, from 0"
        string source "the diagram text"
        string keyword "nullable, the type mermaid detects"
        number startLine "file line a finding points at"
        number endLine
        number firstLine "file line of the first source line"
        boolean terminated "false when the fence never closes"
        string closingFence "nullable, the line that closes it"
        number endOffset "where the fence or file ends"
        StyleDirective[] directives
        function offsetOf "ValueSpan to offset, or null"
        function stats "Promise of DiagramStats"
    }
    StyleDirective {
        enum kind "classDef style linkStyle inlineClass"
        string selector
        string class_name "optional"
        record properties "name to value"
        record spans "name to ValueSpan"
        number line "1-based, within the diagram"
    }
    ValueSpan {
        number line "1-based, within the diagram"
        number start "0-based column"
        number end "0-based column"
    }
    DiagramStats {
        number nodes
        number edges
        number subgraphs
        number max_subgraph_depth
        number max_tree_depth "mindmap treemap treeView ishikawa"
        number rows "erDiagram attributes, classDiagram members"
        string[] node_ids
        string[] subgraph_names
        enum parser_used "langium or mermaid-core"
        string diagram_type
        string error "nullable, the parser's reason"
        number error_line "optional, where the error points"
    }

    classDef docTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef diagramTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef styleTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    class DocModel,Root,Code docTint
    class Diagram,DiagramStats diagramTint
    class StyleDirective,ValueSpan styleTint
```

`offsetOf` returns null when a diagram line cannot be mapped back to the file, which makes a fixer refuse.

</details>

## What is scored from a diagram

The complexity rules score a diagram's stats against thresholds, and the contrast rules score pairs read from its style directives or theme variables.

```mermaid
erDiagram
    Diagram ||--|| DiagramStats : "stats()"
    DiagramStats ||--|| ComplexityMetrics : "calculateComplexity"
    Diagram ||--|| ContrastResult : "contrastOf"
    ContrastResult ||--o{ ContrastPair : "pairs"
    ContrastResult ||--o{ SkippedDirective : "skipped"
    ContrastPair ||--|| ContrastAssessment : "assessment"

    classDef diagramTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef scoreTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    classDef skipTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    class Diagram,DiagramStats diagramTint
    class ComplexityMetrics,ContrastResult,ContrastPair,ContrastAssessment scoreTint
    class SkippedDirective skipTint
```

<details>
<summary>What is scored from a diagram, every field (10 entities)</summary>

Sources:

- `src/parse/metrics.ts` for the thresholds and metrics.
- `src/parse/contrast.ts` for pairs, results and the canvas.
- `src/parse/color.ts` for `ContrastAssessment`.
- `src/rules/shared.ts` for `ContrastSettings`.


A pair's `directive` is a `ContrastSource`.
That is a style directive, or, in a `sequenceDiagram`, a theme variable that has no directive and no span to rewrite.

```mermaid
erDiagram
    DiagramStats ||--|| ComplexityMetrics : "calculateComplexity"
    ThresholdConfig ||--o{ ComplexityMetrics : "scored against"
    Preset ||--o{ ThresholdConfig : "extended by"
    ContrastSettings ||--|| Canvas : "canvas"
    ContrastSettings ||--o{ ContrastResult : "scores, cached per diagram"
    ContrastResult ||--o{ ContrastPair : "pairs"
    ContrastResult ||--o{ SkippedDirective : "skipped"
    ContrastPair }o--o| StyleDirective : "directive, or a theme variable"
    ContrastPair ||--|| ContrastAssessment : "assessment"

    DiagramStats {
        number nodes
        number edges
        number subgraphs
        number max_subgraph_depth
        number max_tree_depth
        number rows "erDiagram attributes, classDiagram members"
    }
    Preset {
        number node_ideal
        number node_acceptable
        number node_complex
        number node_hard_limit
        number vcs_ideal
        number vcs_acceptable
        number vcs_complex
        number vcs_critical
        number node_target
        number vcs_target
    }
    ThresholdConfig {
        number edge_weight "0.5"
        number row_weight "0.25"
        number subgraph_weight "3"
        number depth_weight "0.1"
        string preset_name "canonical name, or custom"
    }
    ComplexityMetrics {
        number visual_complexity_score
        number edge_density
        number cyclomatic_complexity
    }
    ContrastSettings {
        enum profile "github or mkdocs-material"
        Canvas canvas
    }
    Canvas {
        string light "default #ffffff"
        string dark "default #0d1117"
    }
    ContrastResult {
        ContrastPair[] pairs
        SkippedDirective[] skipped
    }
    ContrastPair {
        enum kind "text or border"
        string selector
        ContrastSource directive
        string foreground
        string background
        number line "within the diagram"
        boolean passes "4.5 for text, 3 for a border"
        enum theme "optional, light or dark"
        enum row "optional, odd or even erDiagram row"
        boolean advisory "optional, never a finding"
    }
    SkippedDirective {
        string selector
        number line
        string reason
        boolean blocking "optional, unauditable when true"
    }
    ContrastAssessment {
        string foreground
        string background
        number ratio "WCAG 2.x, 1 to 21"
        enum rating "AAA, AA, AA Large or Fail"
        number apca_lc
    }
    StyleDirective {
        enum kind "classDef style linkStyle inlineClass"
        string selector
    }

    classDef diagramTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef scoreTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    classDef optionTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef styleTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef skipTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    class DiagramStats diagramTint
    class ComplexityMetrics,ContrastResult,ContrastPair,ContrastAssessment scoreTint
    class Preset,ThresholdConfig,ContrastSettings,Canvas optionTint
    class StyleDirective styleTint
    class SkippedDirective skipTint
```

The visual complexity score uses the larger of `max_subgraph_depth` and `max_tree_depth` as its depth.
A blocking skipped directive is what `contrast-directive-unauditable` reports.

</details>

## Rule and finding model

A rule reads a context built around the document model, returns findings from its check, and may return edits from an optional fixer.

```mermaid
erDiagram
    Rule ||--o{ RuleContext : "receives"
    RuleContext }o--|| DocModel : "doc"
    Rule }o--|| Category : "category"
    Rule ||--o{ Finding : "check returns"
    Rule ||--o{ Edit : "fix returns"

    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef inputTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef outputTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    class Rule,Category ruleTint
    class RuleContext,DocModel inputTint
    class Finding,Edit outputTint
```

<details>
<summary>Rule and finding model, every field (9 entities)</summary>

Sources: `src/rules/types.ts` for every entity here, and `src/rules/registry.ts` for the built-in category descriptions.
`CheckContext` and `FixContext` are both aliases of `RuleContext`.

A remediation is not an entity of its own.
It is the optional `remediation` field of a finding, shown in `--json` output.

```mermaid
erDiagram
    Rule ||--o{ RuleContext : "receives per file"
    RuleContext }o--|| DocModel : "doc"
    RuleContext ||--|| RuleOptions : "options"
    RuleContext ||--|| Helpers : "helpers"
    Rule ||--o| OptionSpec : "options"
    OptionSpec ||--o{ RuleOptions : "types"
    Rule }o--|| Category : "category"
    Rule ||--o{ Finding : "check returns"
    Rule ||--o{ Edit : "fix returns"
    Edit ||--|| Expectation : "expect"

    Rule {
        RuleId id "core id, or namespace/key"
        string category
        string summary
        OptionSpec options "optional"
        function check "ctx to Finding[], sync or async"
        function fix "optional, ctx to Edit[]"
    }
    Category {
        string word "parse complexity contrast, or declared"
        string description
    }
    RuleContext {
        DocModel doc
        string file "absolute path"
        RuleOptions options
        Helpers helpers
    }
    DocModel {
        string src
        enum kind "markdown or diagram"
        Diagram[] diagrams
    }
    OptionSpec {
        record types "name to number string boolean string[] canvas"
    }
    RuleOptions {
        record values "name to unknown, read-only"
    }
    Helpers {
        function detectKeyword
        function wcagRatio "fg and bg to ratio"
        function compositeOver "fg over bg to colour"
    }
    Finding {
        string file
        number line "file line"
        number endLine "file line"
        RuleId rule
        string message
        string remediation "optional"
    }
    Edit {
        RuleId rule
        number start "source offset"
        number end "source offset"
        string text "replacement"
        Expectation expect
    }
    Expectation {
        enum kind "same-diagrams or same-tree"
    }

    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef inputTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef outputTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef optionTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class Rule,Category ruleTint
    class RuleContext,DocModel,Helpers inputTint
    class Finding,Edit,Expectation outputTint
    class OptionSpec,RuleOptions optionTint
```

A core rule id has no slash, and a plugin rule id is always `namespace/key`.
Every complexity rule leaves `fix` absent, per [MJL-0004](../adrs/0004-complexity-is-never-autofixed.md).

</details>

## Registry and config

The registry is built from the rules a run knows, with the config and the category flags applied, and every check and fix reads it.

```mermaid
erDiagram
    RegistryInput }o--o| Config : "config"
    Config ||--o{ RuleSetting : "rules"
    RegistryInput }o--o| CategorySelection : "selection"
    RegistryInput ||--|| Registry : "buildRegistry"
    Registry ||--o{ Rule : "rules"
    Registry ||--o{ LoadedSource : "sources"

    classDef configTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class Config,RuleSetting,CategorySelection configTint
    class RegistryInput,Registry,Rule ruleTint
    class LoadedSource pluginTint
```

<details>
<summary>Registry and config, every field (8 entities)</summary>

Sources:

- `src/rules/registry.ts` for `RegistryInput`, `Registry`, `CategorySelection` and `LoadedSource`.
- `src/config.ts` for `Config` and `RuleSetting`.

With no config file, the run uses `NO_CONFIG`: no extra plugins, strict loading and no rule settings.

```mermaid
erDiagram
    RegistryInput }o--o| Config : "config"
    RegistryInput }o--o| CategorySelection : "selection"
    RegistryInput ||--|| Registry : "buildRegistry"
    Config ||--o{ RuleSetting : "rules, keyed by rule id"
    RuleSetting }o--|| Rule : "applies to"
    Registry ||--o{ Rule : "rules, fixOrder"
    Registry ||--o{ Category : "categories"
    Registry ||--o{ LoadedSource : "sources"
    LoadedSource ||--|{ Rule : "rules"

    RegistryInput {
        Rule[] rules "built-ins plus plugin rules"
        Rule[] fixOrder
        map categories "word to description"
        LoadedSource[] sources "optional"
        Config config "optional"
        boolean ignoreUnknownPluginIds "optional"
        CategorySelection selection "optional"
    }
    Config {
        list plugins "string[], or false for built-ins only"
        enum pluginLoading "strict or lenient"
        map rules "id to RuleSetting"
        string file "nullable, for messages"
    }
    RuleSetting {
        enum severity "error or off"
        RuleOptions options
    }
    CategorySelection {
        string[] enable "optional, --category"
        string[] disable "optional, --disable-category"
        string prefix "optional, -- from the command"
    }
    Registry {
        Rule[] rules "active only"
        Rule[] fixOrder "active fixers, in order"
        set enabled "RuleId"
        map options "RuleId to RuleOptions"
        map categories "word to description"
        LoadedSource[] sources
        string[] ignoredSettings "settings for unloaded plugin rules"
    }
    LoadedSource {
        enum kind "local package config"
        string spec
        string namespace
        RuleId[] rules
    }
    Rule {
        RuleId id
        string category
    }
    Category {
        string word
        string description
    }

    classDef configTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class Config,RuleSetting,CategorySelection configTint
    class RegistryInput,Registry,Rule,Category ruleTint
    class LoadedSource pluginTint
```

A rule that is off keeps its options, so a category flag that turns it back on runs it as configured.
The category flags have the last word for the run, per [MJL-0020](../adrs/0020-category-flags-have-the-last-word-for-a-run.md).

</details>

## Fix model

A fixer proposes edits, the engine proves each edit's expectation on the re-parsed document, and every edit ends up applied or refused.

```mermaid
erDiagram
    Rule ||--o{ Edit : "fix proposes"
    Edit ||--|| Expectation : "expect"
    Edit ||--o{ Verification : "checked by"
    Verification ||--|| Verdict : "returns"
    FixReport ||--o{ Edit : "applied"
    FixReport ||--o{ Edit : "refused"

    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef editTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef proofTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class Rule ruleTint
    class Edit,Expectation,FixReport editTint
    class Verification,Verdict proofTint
```

<details>
<summary>Fix model, every field and what verification compares (8 entities)</summary>

Sources:

- `src/rules/types.ts` for `Edit` and `Expectation`.
- `src/fix/engine.ts` for `FixReport` and the refusal memory.
- `src/fix/verify.ts` for `Verdict` and the comparisons.


Three entities here are values inside a function, not exported types.
`Verification` is one call of `verify(edit, before, after)`.
`ComparedShape` is the tuple `sameDiagrams` builds for each diagram.
`RefusalKey` is an entry in the engine's `refusedKeys` set.

```mermaid
erDiagram
    Rule ||--o{ Edit : "fix proposes"
    Edit ||--|| Expectation : "expect"
    Edit ||--o{ Verification : "checked by"
    Verification }o--|| DocModel : "before and after"
    Verification ||--o{ ComparedShape : "per diagram, same-diagrams"
    Verification ||--|| Verdict : "returns"
    Edit ||--o| RefusalKey : "remembered when refused"
    FixReport ||--o{ Edit : "applied, refused"

    Edit {
        RuleId rule "set by the engine for a plugin"
        number start "source offset"
        number end "source offset"
        string text "replacement"
        Expectation expect
    }
    Expectation {
        enum kind "same-diagrams or same-tree"
    }
    Verification {
        Edit edit
        DocModel before "built from the source before"
        DocModel after "built from the spliced source"
    }
    ComparedShape {
        boolean parseFailed
        string diagram_type
        number nodes
        number edges
        number subgraphs
        number max_subgraph_depth
        number max_tree_depth
        number rows "erDiagram attributes, classDiagram members"
        string[] node_ids
        string[] subgraph_names
    }
    Verdict {
        enum value "accept or refuse"
    }
    RefusalKey {
        string rule
        string slice "source text the edit replaces"
        string text "replacement"
    }
    FixReport {
        string output "the fixed source"
        Edit[] applied
        Edit[] refused
    }
    DocModel {
        enum kind "markdown or diagram"
        Root tree
        Diagram[] diagrams
    }

    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef editTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef proofTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    classDef refuseTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    classDef docTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    class Rule ruleTint
    class Edit,Expectation,FixReport editTint
    class Verification,ComparedShape,Verdict proofTint
    class RefusalKey refuseTint
    class DocModel docTint
```

What each expectation compares, and nothing more:

- **same-diagrams** compares the diagram count, the markdown tree with fence bodies blanked, each diagram's keyword, and each diagram's compared shape.
- **same-tree** compares the markdown tree, with whitespace in prose text collapsed and fence bodies kept.
  In markdown it also refuses an edit that makes a parsing diagram fail to parse.
  In a raw diagram file the tree is empty, so it also demands everything same-diagrams does.

Verification does not compare edge endpoints, edge labels or node text.
A fixer must not rely on it to catch a changed edge or label.

A malformed edit is refused before any re-parse, and its refusal key holds the offsets in place of the source slice.
An edit refused once stays refused while its source slice is unchanged.

</details>

## Plugin contract

A plugin's default export holds its meta and its rules, and each plugin rule becomes an ordinary rule under its namespace.

```mermaid
erDiagram
    Plugin ||--|| PluginMeta : "meta"
    Plugin ||--o{ PluginRule : "rules"
    PluginRule ||--o{ PluginFinding : "check returns"
    PluginRule ||--o{ PluginEdit : "fix returns"
    PluginRule ||--|| Rule : "toRule"

    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    classDef outputTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    class Plugin,PluginMeta,PluginRule pluginTint
    class PluginFinding,PluginEdit outputTint
    class Rule ruleTint
```

<details>
<summary>Plugin contract, every field and constraint (8 entities)</summary>

Sources: `src/plugins/contract.ts` for the contract types and patterns, and `src/plugins/load.ts` for `toRule` and the checks applied at load.
The contract version is `API_VERSION`, which is 1, and a plugin targeting another version fails to load.

```mermaid
erDiagram
    Plugin ||--|| PluginMeta : "meta"
    Plugin ||--o{ PluginRule : "rules, keyed by rule key"
    PluginMeta ||--o{ Category : "declares new words"
    PluginRule }o--|| Category : "category"
    PluginRule ||--o| OptionSpec : "options"
    PluginRule ||--o{ PluginFinding : "check returns"
    PluginRule ||--o{ PluginEdit : "fix returns"
    PluginRule ||--|| Rule : "toRule, id namespace/key"

    Plugin {
        PluginMeta meta
        record rules "key to PluginRule"
    }
    PluginMeta {
        string name "required"
        string namespace "lower-case words joined by hyphens"
        number apiVersion "must equal API_VERSION"
        record categories "optional, word to description"
    }
    PluginRule {
        string category "one lower-case word"
        string summary "required"
        OptionSpec options "optional"
        function check "ctx to PluginFinding[]"
        function fix "optional, ctx to PluginEdit[]"
    }
    Category {
        string word "not a built-in word"
        string description "one line"
    }
    OptionSpec {
        record types "preset and profile only as string"
    }
    PluginFinding {
        number line "1 or more"
        string message
        number endLine "optional"
        string remediation "optional"
    }
    PluginEdit {
        number start
        number end
        string text
        Expectation expect "required"
    }
    Rule {
        RuleId id "namespace/key"
        string category
        string summary
        function check "wrapped, never throws"
        function fix "optional, wrapped"
    }

    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    classDef outputTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef ruleTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef optionTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    class Plugin,PluginMeta,PluginRule pluginTint
    class PluginFinding,PluginEdit outputTint
    class Rule,Category ruleTint
    class OptionSpec optionTint
```

A rule key must start with its category, as in `category-short-name`.
The engine adds the file and the rule id to a plugin finding.
It adds the rule id to a plugin edit, so a plugin cannot report as another rule.
A check that throws or returns a malformed list becomes one finding for that rule.
A fixer that throws, returns a non-list or omits a valid expectation stops the run with `PluginFixerError`.

</details>

## Plugin loading

Discovery finds plugin sources, loading turns each into a plugin or a failure, and the merged plugin set feeds the registry.

```mermaid
erDiagram
    Discovery ||--o{ PluginSource : "sources"
    Discovery ||--o{ UnresolvedSource : "failures"
    PluginSource }|--o| Plugin : "loads as"
    PluginSet ||--o{ Rule : "rules"
    PluginSet ||--o{ LoadedSource : "sources"
    PluginSet ||--o{ PluginFailure : "failures"

    classDef discoverTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef loadTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef registryTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef failTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    class Discovery,PluginSource discoverTint
    class Plugin loadTint
    class PluginSet,Rule,LoadedSource registryTint
    class UnresolvedSource,PluginFailure failTint
```

<details>
<summary>Plugin loading, every field (10 entities)</summary>

Sources:

- `src/plugins/discover.ts` for `Discovery`, `PluginSource` and `UnresolvedSource`.
- `src/plugins/load.ts` for `LocalLoad`.
- `src/plugins/index.ts` for `PluginSet` and `PluginFailure`.
- `src/errors.ts` for `PluginLoadError`.

All local rule files load together as one plugin, under the reserved namespace `local`.

```mermaid
erDiagram
    Config ||--o{ PluginSource : "plugins list, kind config"
    Discovery ||--o{ PluginSource : "sources, deduped by path"
    Discovery ||--o{ UnresolvedSource : "failures"
    UnresolvedSource ||--|| PluginLoadError : "error"
    PluginSource }|--o| LocalLoad : "local files"
    LocalLoad ||--o| Plugin : "plugin, namespace local"
    PluginSource |o--o| Plugin : "package or config"
    PluginSet ||--o{ PluginFailure : "failures"
    PluginFailure ||--|| PluginLoadError : "error"
    PluginSet ||--o{ LoadedSource : "sources"
    Plugin ||--o| LoadedSource : "accepted as"

    Config {
        list plugins "string[] or false"
        enum pluginLoading "strict or lenient"
    }
    Discovery {
        PluginSource[] sources
        UnresolvedSource[] failures
    }
    PluginSource {
        enum kind "local package config"
        string spec "package name or path under the root"
        string path "the file to import"
    }
    UnresolvedSource {
        enum kind "local package config"
        PluginLoadError error
    }
    LocalLoad {
        Plugin plugin "nullable"
        PluginLoadError[] failures
    }
    Plugin {
        PluginMeta meta
        record rules
    }
    PluginSet {
        Rule[] rules
        map categories "built-in plus declared words"
        LoadedSource[] sources
        string[] skipped "specs found in off mode"
        PluginFailure[] failures "empty in strict mode"
    }
    PluginFailure {
        string source
        enum kind "local package config"
        PluginLoadError error
    }
    PluginLoadError {
        string code "plugin-import, plugin-contract and more"
        string source
        string message
    }
    LoadedSource {
        enum kind "local package config"
        string spec
        string namespace
        RuleId[] rules
    }

    classDef configTint fill:#52525b36,stroke:#71717a,stroke-width:1px
    classDef discoverTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef loadTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef registryTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef failTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    class Config configTint
    class Discovery,PluginSource discoverTint
    class LocalLoad,Plugin loadTint
    class PluginSet,LoadedSource registryTint
    class UnresolvedSource,PluginFailure,PluginLoadError failTint
```

The plugin mode is `off`, `strict`, `lenient` or `collect`, and it decides what a failure does.
Strict throws the first failure, lenient and collect record it and carry on, and off loads nothing.
The first plugin to claim a namespace or a new category word keeps it, and a later claimant fails with `PluginConflictError`.

</details>
