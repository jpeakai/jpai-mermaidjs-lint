# Architecture

How `jpai-mermaidjs-lint` is put together, and how a run moves through it, read from `src/`.
[DATA_MODEL.md](DATA_MODEL.md) holds every shape these diagrams pass around, field by field.

Each section opens with a simplified diagram and a one-sentence summary.
The full diagram sits in a collapsible block beneath it.
The terms follow [GLOSSARY.md](../GLOSSARY.md), and the decisions behind the design live in [`adrs/`](../adrs/).

The docs site draws the run for consumers on its [how it works](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/how-it-works/) page.
It describes the latest release, and this file describes `main`.

## Contents

- [Modules](#modules)
- [Run pipeline](#run-pipeline)
- [A lint run](#a-lint-run)
- [A fix run](#a-fix-run)
- [Fix verification](#fix-verification)
- [Plugin loading](#plugin-loading)
- [Core data shapes](#core-data-shapes)

## Modules

The command sets up a registry once, then checks or fixes each file through one document model that the parse engine reads.

```mermaid
flowchart LR
    CLI["bin.ts, cli.ts<br/>command"] --> SETUP["project.ts<br/>setup"]
    LIB["index.ts, testing.ts<br/>library entry points"] -.-> CHECK
    SETUP --> CONFIG["config.ts<br/>config file"]
    SETUP --> PLUG["plugins/<br/>plugin loader"]
    SETUP --> REG["rules/registry.ts<br/>registry"]
    REG --> RULES["rules/<br/>built-in rules"]
    CLI --> FILES["files.ts<br/>file collection"]
    CLI --> CHECK["check.ts<br/>check"]
    CLI --> FIX["fix/<br/>fix engine, verifier"]
    CHECK --> MODEL["model.ts<br/>document model"]
    FIX --> MODEL
    MODEL --> PARSE["parse/<br/>parse engine"]
    RULES --> PARSE

    classDef entry fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    classDef setup fill:#dbeafe,stroke:#2563eb,color:#1e293b,stroke-width:2px
    classDef plugin fill:#ede9fe,stroke:#7c3aed,color:#1e293b,stroke-width:2px
    classDef rules fill:#fef3c7,stroke:#b45309,color:#1e293b,stroke-width:2px
    classDef doc fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    classDef fix fill:#fce7f3,stroke:#be185d,color:#1e293b,stroke-width:2px
    class CLI,LIB entry
    class SETUP,CONFIG setup
    class PLUG plugin
    class REG,RULES rules
    class FILES,CHECK,MODEL,PARSE doc
    class FIX fix
```

<details>
<summary>Entry points, setup and the plugin loader, by file (15 nodes)</summary>

Each arrow is an import.
`bin.ts` is the command, `index.ts` the library and `testing.ts` the plugin test helper, the three bundles `make build` writes.
Most modules also import `errors.ts`, which holds every named failure and its stable code.

```mermaid
flowchart LR
    subgraph Entry["Entry points"]
        BIN["bin.ts"]
        CLI["cli.ts"]
        IDX["index.ts"]
        TST["testing.ts"]
    end
    subgraph Setup["Setup"]
        PRJ["project.ts<br/>findProjectRoot, setUp"]
        CFG["config.ts<br/>findConfig, loadConfig"]
    end
    subgraph Plugins["plugins/"]
        PIDX["index.ts<br/>loadPlugins"]
        DSC["discover.ts<br/>discoverSources"]
        LD["load.ts<br/>loadLocal, loadPackage, toRule"]
        CT["contract.ts<br/>API_VERSION, patterns"]
        RT["runtime.ts<br/>TypeScript support"]
    end
    REG["rules/registry.ts<br/>buildRegistry"]
    RIDX["rules/index.ts<br/>RULES, FIX_ORDER"]
    ERR["errors.ts"]
    CHK["check.ts"]

    BIN --> CLI --> PRJ
    IDX --> PRJ
    TST --> LD
    TST --> REG
    TST --> CHK
    PRJ --> CFG
    PRJ --> PIDX
    PRJ --> REG
    PRJ --> RIDX
    PIDX --> DSC
    PIDX --> LD
    LD --> CT
    LD --> RT
    DSC --> CFG
    REG --> RIDX
    CLI --> ERR

    classDef entry fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    classDef setup fill:#dbeafe,stroke:#2563eb,color:#1e293b,stroke-width:2px
    classDef plugin fill:#ede9fe,stroke:#7c3aed,color:#1e293b,stroke-width:2px
    classDef rules fill:#fef3c7,stroke:#b45309,color:#1e293b,stroke-width:2px
    classDef doc fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    classDef fail fill:#fee2e2,stroke:#dc2626,color:#1e293b,stroke-width:2px
    class BIN,CLI,IDX,TST entry
    class PRJ,CFG setup
    class PIDX,DSC,LD,CT,RT plugin
    class REG,RIDX rules
    class CHK doc
    class ERR fail
```

</details>

<details>
<summary>Check, fix, rules and the parse engine, by file (19 nodes)</summary>

Each arrow is an import.
The parse engine reads structure from mermaid's own parsers, per [MJL-0001](../adrs/0001-parse-with-mermaids-own-parsers.md).
`stats.ts` uses `@mermaid-js/parser` for the Langium grammars and mermaid core, under `happy-dom`, for the rest.

```mermaid
flowchart LR
    CLI["cli.ts"]
    subgraph Run["Run"]
        FLS["files.ts<br/>collectFiles"]
        CHK["check.ts<br/>checkModel, optionsFor"]
    end
    subgraph Fix["fix/"]
        ENG["engine.ts<br/>fixSourceReport"]
        VER["verify.ts<br/>verify"]
    end
    subgraph Rules["rules/"]
        REG["registry.ts"]
        RIDX["index.ts"]
        TYP["types.ts<br/>Rule, Finding, Edit"]
        SHR["shared.ts<br/>measure, contrastOf"]
        CPX["complexity.ts plus<br/>6 complexity rules"]
        CON["3 contrast rules"]
        PRS["2 parse rules"]
    end
    MDL["model.ts<br/>buildDocModel"]
    subgraph Parse["parse/"]
        STA["stats.ts<br/>extractStats"]
        MET["metrics.ts<br/>calculateComplexity"]
        COL["color.ts<br/>directives, WCAG"]
        CTR["contrast.ts<br/>scoreDiagram"]
    end

    CLI --> FLS
    CLI --> CHK
    CLI --> ENG
    ENG --> CHK
    ENG --> VER
    ENG --> MDL
    CHK --> MDL
    CHK --> REG
    VER --> MET
    REG --> RIDX
    RIDX --> CPX
    RIDX --> CON
    RIDX --> PRS
    CPX --> SHR
    CON --> SHR
    PRS --> SHR
    PRS --> MET
    SHR --> MET
    SHR --> CTR
    MDL --> STA
    MDL --> COL
    CTR --> COL
    CTR --> STA
    FLS --> MDL

    classDef entry fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    classDef rules fill:#fef3c7,stroke:#b45309,color:#1e293b,stroke-width:2px
    classDef doc fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    classDef fix fill:#fce7f3,stroke:#be185d,color:#1e293b,stroke-width:2px
    class CLI entry
    class REG,RIDX,TYP,SHR,CPX,CON,PRS rules
    class FLS,CHK,MDL,STA,MET,COL,CTR doc
    class ENG,VER fix
```

Every rule module imports `types.ts`, so those arrows are left out.

</details>

## Run pipeline

A run sets up once, then each file is fixed to a fixpoint when asked, checked by every active rule, and reported.

```mermaid
flowchart LR
    R["Find project<br/>root"] --> C["Load<br/>config"] --> P["Load<br/>plugins"] --> G["Build<br/>registry"]
    G --> F["Collect<br/>files"] --> M["Build document<br/>model"]
    M --> Q{"--fix?"}
    Q -->|yes| X["Fix to fixpoint,<br/>write file"]
    X --> K
    Q -->|no| K["Check with<br/>all rules"]
    K --> O["Report findings,<br/>exit 0 or 1"]

    classDef setup fill:#dbeafe,stroke:#2563eb,color:#1e293b,stroke-width:2px
    classDef doc fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    classDef fix fill:#ede9fe,stroke:#7c3aed,color:#1e293b,stroke-width:2px
    classDef report fill:#fef3c7,stroke:#b45309,color:#1e293b,stroke-width:2px
    classDef gate fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    class R,C,P,G setup
    class F,M,K doc
    class X fix
    class O report
    class Q gate
```

<details>
<summary>Run pipeline, every step and exit (23 nodes)</summary>

Sources:

- `run` and `main` in `src/cli.ts`.
- `setUp` in `src/project.ts`.
- `fixSourceReport` in `src/fix/engine.ts`.
- `checkModel` in `src/check.ts`.

A usage error exits 2 before any file is read, and any other failure propagates to `bin.ts`, which exits 1.

```mermaid
flowchart TB
    A["Parse flags,<br/>checkRunFlags"] --> U{"Usage<br/>error?"}
    U -->|yes| X2["Exit 2"]
    subgraph Setup["Setup, once per run"]
        R["findProjectRoot"]
        C["findConfig, loadConfig,<br/>or NO_CONFIG"]
        P["loadPlugins in the run's mode"]
        G["buildRegistry with config<br/>and category flags"]
    end
    U -->|no| R --> C --> P --> G
    G --> F["collectFiles, each file<br/>processed concurrently"]
    subgraph Fix["Fix, only with --fix"]
        L["Refuse links that leave<br/>the project root"]
        B["Build model from current source"]
        FX["Next fixer in fixOrder<br/>proposes edits"]
        W["Refuse malformed, drop no-op<br/>and already refused edits"]
        SP["Splice, re-parse"]
        V{"Verify each edit's<br/>expectation"}
        RF["Refuse, remember,<br/>try one edit at a time"]
        DN["No fixer progressed:<br/>write the file if changed"]
    end
    subgraph Check["Check"]
        CM["checkModel: every active<br/>rule's check at once"]
        SO["Sort by line, then rule id"]
    end
    F -->|"--fix"| L --> B
    F -->|"no --fix"| CM
    B --> FX --> W --> SP --> V
    V -->|"accept: restart the pass"| B
    V -->|refuse| RF --> FX
    FX -->|"no edits left"| DN --> CM
    CM --> SO --> O["Print findings, or JSON"] --> E{"Any finding?"}
    E -->|yes| X1["Exit 1"]
    E -->|no| X0["Exit 0"]

    classDef setup fill:#dbeafe,stroke:#2563eb,color:#1e293b,stroke-width:2px
    classDef doc fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    classDef fix fill:#ede9fe,stroke:#7c3aed,color:#1e293b,stroke-width:2px
    classDef refuse fill:#fee2e2,stroke:#dc2626,color:#1e293b,stroke-width:2px
    classDef report fill:#fef3c7,stroke:#b45309,color:#1e293b,stroke-width:2px
    classDef gate fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    class A,R,C,P,G setup
    class F,CM,SO doc
    class L,B,FX,W,SP,DN fix
    class RF,X2 refuse
    class O,X1,X0 report
    class U,V,E gate
```

A fix run that never reaches a fixpoint stops after 1,000 passes with `FixNotConvergingError`, and nothing is written.

</details>

## A lint run

The command builds the registry once, then checks every file concurrently, with every active rule started at once on each file.

```mermaid
sequenceDiagram
    actor U as User
    participant CLI as cli.ts
    participant S as project.ts
    participant K as check.ts
    participant R as Rules
    rect rgba(59, 130, 246, 0.12)
        U->>CLI: mermaidjs-lint docs/
        CLI->>S: setUp
        S-->>CLI: registry
    end
    rect rgba(34, 197, 94, 0.12)
        loop each file, concurrently
            CLI->>K: checkModel(document model)
            K->>R: every active rule's check, at once
            R-->>K: findings
            K-->>CLI: findings, sorted
        end
    end
    rect rgba(217, 119, 6, 0.12)
        CLI-->>U: findings, exit 0 or 1
    end
```

<details>
<summary>A lint run, every call (11 participants)</summary>

Sources:

- `run` in `src/cli.ts`.
- `setUp` in `src/project.ts`.
- `checkModel` and `optionsFor` in `src/check.ts`.
- `buildDocModel` in `src/model.ts`.
- `contrastOf` in `src/rules/shared.ts`, which calls `scoreDiagram` in `src/parse/contrast.ts`.

Each rule receives its options from `optionsFor`, which lays the run flags over the configured options.

```mermaid
sequenceDiagram
    actor U as User
    participant CLI as cli.ts
    participant S as project.ts
    participant C as config.ts
    participant P as plugins/
    participant G as registry.ts
    participant F as files.ts
    participant M as model.ts
    participant K as check.ts
    participant R as Rule
    participant E as parse/
    rect rgba(59, 130, 246, 0.12)
        U->>CLI: argv
        CLI->>CLI: parse flags, checkRunFlags
        CLI->>S: setUp(cwd, config path, plugin flags, selection)
        S->>S: findProjectRoot
        S->>C: findConfig, loadConfig
        C-->>S: Config, or NO_CONFIG
        S->>P: loadPlugins(root, config, mode)
        P-->>S: PluginSet
        S->>G: buildRegistry
        G-->>S: Registry
        S-->>CLI: root, registry, skipped, failures
    end
    rect rgba(34, 197, 94, 0.12)
        CLI->>F: collectFiles(paths)
        F-->>CLI: files, unreadable, symlinks
        loop each file, concurrently
            CLI->>M: buildDocModel(src, kind)
            M-->>CLI: DocModel
            CLI->>K: checkModel(doc, file, flags, registry)
            K->>R: check(ctx), every active rule at once
            R->>E: diagram.stats(), scoreDiagram
            E-->>R: DiagramStats, ContrastResult
            R-->>K: Finding[]
            K-->>CLI: findings by line, then rule id
        end
    end
    rect rgba(217, 119, 6, 0.12)
        alt --json
            CLI-->>U: findings, files, plugins, skippedPlugins, canvasSetAside
        else text
            CLI-->>U: one line per finding, then the count
        end
        CLI-->>U: exit 1 on any finding, else 0
    end
```

`collectFiles` walks a directory without following links, and the command names every link it skipped.

</details>

## A fix run

The fix engine asks each fixer for edits, proves every edit on the re-parsed source, and writes only what survives.

```mermaid
sequenceDiagram
    participant CLI as cli.ts
    participant FE as fix/engine.ts
    participant FX as Fixer
    participant V as fix/verify.ts
    participant FS as File
    rect rgba(139, 92, 246, 0.12)
        CLI->>FE: fixSourceReport(src, file)
        loop each pass, until no fixer progresses
            FE->>FX: fix(ctx), in fixOrder
            FX-->>FE: Edit[]
            FE->>V: verify(edit, before, after)
            alt accept
                V-->>FE: accept, so restart the pass
            else refuse
                V-->>FE: refuse, so remember the edit
            end
        end
        FE-->>CLI: output, applied, refused
    end
    rect rgba(217, 119, 6, 0.12)
        CLI->>FS: write the output, if it changed
        CLI->>CLI: check the fixed source
    end
```

<details>
<summary>A fix run, with batching, refusal and non-convergence (7 participants)</summary>

Source: `run` in `src/cli.ts`, `fixSourceReport` in `src/fix/engine.ts` and `verify` in `src/fix/verify.ts`.
A refused edit leaves the source untouched, so its finding stays in the check that follows, per [MJL-0005](../adrs/0005-a-fixer-refuses-when-unsure.md).

```mermaid
sequenceDiagram
    participant CLI as cli.ts
    participant FE as fix/engine.ts
    participant M as model.ts
    participant FX as Fixer
    participant V as fix/verify.ts
    participant E as parse/
    participant FS as File
    rect rgba(59, 130, 246, 0.12)
        CLI->>CLI: refuse links that leave the project root
        CLI->>FS: readFile
        CLI->>FE: fixSourceReport(src, file, flags, registry)
    end
    rect rgba(139, 92, 246, 0.12)
        loop each pass, at most 1,000
            FE->>M: buildDocModel(current)
            loop each rule in fixOrder, until one progresses
                FE->>FX: fix(doc, file, options, helpers)
                FX-->>FE: Edit[]
                FE->>FE: refuse malformed, drop no-op and already refused
                FE->>FE: splice the batch, or one edit
                FE->>M: buildDocModel(next)
                FE->>V: verify(edit, before, after), each edit
                V->>E: stats() before and after
                E-->>V: DiagramStats
                V-->>FE: accept or refuse, each edit
                FE->>FE: every edit accepted: keep next, record applied, restart the pass
                FE->>FE: an edit refused: try one edit at a time, refuse and remember each failure
            end
        end
    end
    rect rgba(239, 68, 68, 0.12)
        alt no fixer progressed
            FE-->>CLI: FixReport with output, applied, refused
        else 1,000 passes without a fixpoint
            FE-->>CLI: FixNotConvergingError, nothing written
        end
    end
    rect rgba(217, 119, 6, 0.12)
        CLI->>FS: writeFile, if the output differs
        CLI->>CLI: checkModel on the fixed source
    end
```

A batch is tried whole only when it holds more than one edit and none overlap.
Every accepted edit restarts the pass, because offsets are valid only for the source they were computed from.

</details>

## Fix verification

The verifier accepts an edit only when the re-parsed document keeps what the edit's expectation claims.

```mermaid
flowchart LR
    E["Edit, document<br/>before and after"] --> K{"expect.kind"}
    K -->|same-tree| T{"Markdown tree<br/>unchanged?"}
    T -->|no| R["Refuse"]
    T -->|"yes, markdown"| P{"A parsing diagram<br/>now fails?"}
    P -->|yes| R
    P -->|no| A["Accept"]
    T -->|"yes, raw diagram file"| D
    K -->|same-diagrams| D{"Same diagrams?"}
    D -->|no| R
    D -->|yes| A

    classDef fix fill:#ede9fe,stroke:#7c3aed,color:#1e293b,stroke-width:2px
    classDef gate fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    classDef refuse fill:#fee2e2,stroke:#dc2626,color:#1e293b,stroke-width:2px
    classDef accept fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    class E fix
    class K,T,P,D gate
    class R refuse
    class A accept
```

<details>
<summary>Fix verification, every comparison and what it leaves out (13 nodes)</summary>

Source: `verify`, `sameDiagrams`, `breaksAParse` and `normalise` in `src/fix/verify.ts`.
Every fix is verified by re-parse, per [MJL-0006](../adrs/0006-every-fix-is-verified-by-reparse.md).

```mermaid
flowchart TB
    K{"expect.kind"}
    T{"Tree equal, ignoring positions,<br/>prose whitespace collapsed?"}
    MD{"Both documents<br/>markdown?"}
    BP{"Any diagram that parsed<br/>before fails after?"}
    subgraph SD["same-diagrams, in this order"]
        N{"Same number<br/>of diagrams?"}
        TB{"Tree equal with<br/>fence bodies blanked?"}
        KW{"Each diagram keeps<br/>its keyword?"}
        SH{"Each diagram keeps parse success,<br/>type, node, edge, row and subgraph counts,<br/>both depths, node ids, subgraph names?"}
    end
    NOT["Never compared:<br/>edge endpoints, edge labels, node text"]
    R["Refuse"]
    A["Accept"]

    K -->|same-tree| T
    T -->|no| R
    T -->|yes| MD
    MD -->|yes| BP
    BP -->|yes| R
    BP -->|no| A
    MD -->|"no, raw diagram file"| N
    K -->|same-diagrams| N
    N -->|no| R
    N -->|yes| TB
    TB -->|no| R
    TB -->|yes| KW
    KW -->|no| R
    KW -->|yes| SH
    SH -->|no| R
    SH -->|yes| A
    SH -.- NOT

    classDef gate fill:#f1f5f9,stroke:#64748b,color:#1e293b,stroke-width:1px
    classDef refuse fill:#fee2e2,stroke:#dc2626,color:#1e293b,stroke-width:2px
    classDef accept fill:#dcfce7,stroke:#16a34a,color:#1e293b,stroke-width:2px
    classDef note fill:#fef3c7,stroke:#b45309,color:#1e293b,stroke-width:1px,stroke-dasharray:5 5
    class K,T,MD,BP,N,TB,KW,SH gate
    class R refuse
    class A accept
    class NOT note
```

Verification does not compare edge endpoints, edge labels or node text.
An edit that rewires an edge or renames a label while keeping the counts and ids can pass `same-diagrams`.
So a fixer must never rely on the verifier to catch such a change.

</details>

## Plugin loading

Plugins are discovered, loaded and checked against the contract, then merged into the registry, and the plugin mode decides what a failure does.

```mermaid
sequenceDiagram
    participant S as project.ts
    participant P as plugins/index.ts
    participant D as discover.ts
    participant L as load.ts
    participant G as registry.ts
    rect rgba(34, 197, 94, 0.12)
        S->>P: loadPlugins(root, config, mode)
        P->>D: discoverSources
        D-->>P: sources, unresolved failures
    end
    rect rgba(59, 130, 246, 0.12)
        alt mode off
            P-->>S: every spec reported as skipped
        else strict, lenient or collect
            P->>L: loadLocal, loadPackage
            L-->>P: Plugin, or PluginLoadError
            P->>P: claim namespaces and category words
            P->>L: toRule for each plugin rule
            P-->>S: PluginSet
        end
    end
    rect rgba(217, 119, 6, 0.12)
        S->>G: buildRegistry(built-ins plus plugin rules, config)
    end
```

<details>
<summary>Plugin loading, every source, check and failure path (6 participants)</summary>

Sources:

- `setUp` in `src/project.ts`.
- `loadPlugins` in `src/plugins/index.ts`.
- `discoverSources` in `src/plugins/discover.ts`.
- `loadLocal`, `loadPackage`, `parsePlugin` and `toRule` in `src/plugins/load.ts`.

Plugins follow the prose gates contract, per [MJL-0007](../adrs/0007-plugins-follow-the-prose-gates-contract.md).

The mode is picked before loading.
It is off for `--no-plugins` or `plugins: false`, collect for `--validate-plugins`, and lenient for `--lenient-plugins` or `pluginLoading: lenient`.
Otherwise it is strict.

```mermaid
sequenceDiagram
    participant S as project.ts
    participant P as plugins/index.ts
    participant D as discover.ts
    participant L as load.ts
    participant M as Plugin module
    participant G as registry.ts
    rect rgba(34, 197, 94, 0.12)
        S->>P: loadPlugins(root, config, mode)
        P->>D: discoverSources(root, config)
        D->>D: 1. local rule files in .mermaidjs-lint/rules
        D->>D: 2. declared mermaidjs-lint-plugin dependencies
        D->>D: 3. paths or names in config plugins
        D-->>P: sources deduped by path, unresolved failures
    end
    rect rgba(59, 130, 246, 0.12)
        alt mode off
            P-->>S: every spec as skipped, nothing imported
        else strict, lenient or collect
            P->>L: loadLocal(local sources)
            L->>M: import each file, one rule per file
            M-->>L: default export, optional categories
            L-->>P: one plugin, namespace local, plus failures
            P->>L: loadPackage(each other source)
            L->>M: import the module
            M-->>L: default export
            L->>L: parsePlugin: apiVersion, name, namespace, categories, each rule
            L-->>P: Plugin, or PluginLoadError
        end
    end
    rect rgba(139, 92, 246, 0.12)
        P->>P: first claimant keeps a namespace or category word
        P->>L: toRule, id namespace/key
        L-->>P: Rule, check and fix wrapped
    end
    rect rgba(239, 68, 68, 0.12)
        alt strict
            P-->>S: throw the first PluginLoadError
        else lenient or collect
            P-->>S: PluginSet, failed sources left out and recorded
        end
    end
    rect rgba(217, 119, 6, 0.12)
        S->>G: buildRegistry, ignoring settings for unloaded plugin rules unless strict
        G-->>S: Registry
    end
```

A failure is settled where it happens, so a strict run throws at the first one, during discovery, loading or the conflict check.
A bad plugin stops the run with its reason, unless the run is lenient or collecting.

</details>

## Core data shapes

Setup hands each run a registry, rules read the document model, and a run ends in findings and, under `--fix`, a fix report.

```mermaid
erDiagram
    Setup ||--|| Registry : "registry"
    Setup ||--o{ PluginFailure : "failures"
    Registry ||--o{ Rule : "rules"
    Rule }o--|| DocModel : "reads"
    Rule ||--o{ Finding : "check returns"
    FixReport ||--o{ Edit : "applied or refused"

    classDef setupTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef docTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef outTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef failTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    class Setup,Registry setupTint
    class Rule,DocModel docTint
    class Finding,FixReport,Edit outTint
    class PluginFailure failTint
```

<details>
<summary>Core data shapes, with the run's inputs and its JSON report (12 entities)</summary>

Sources: `src/project.ts`, `src/check.ts`, `src/files.ts`, `src/rules/registry.ts`, `src/rules/types.ts`, `src/fix/engine.ts` and `src/plugins/index.ts`.
`JsonReport` is not an exported type: it is the object `run` in `src/cli.ts` prints under `--json`.
[DATA_MODEL.md](DATA_MODEL.md) has every field of the document, rule, fix and plugin models.

```mermaid
erDiagram
    SetupOptions ||--|| Setup : "setUp"
    Setup ||--|| Registry : "registry"
    Setup ||--o{ PluginFailure : "failures"
    Registry ||--o{ LoadedSource : "sources"
    Registry ||--o{ Rule : "rules"
    Collected ||--o{ DocModel : "one per file"
    RunFlags ||--o{ Rule : "options laid over config"
    Rule }o--|| DocModel : "reads"
    Rule ||--o{ Finding : "check returns"
    FixReport ||--o{ Edit : "applied, refused"
    JsonReport ||--o{ Finding : "findings"
    JsonReport ||--o{ LoadedSource : "plugins"
    JsonReport ||--o{ PluginFailure : "skippedPlugins"

    SetupOptions {
        string cwd
        string configPath "optional"
        boolean noPlugins "optional"
        boolean lenient "optional"
        boolean collect "optional"
        CategorySelection selection "optional"
    }
    Setup {
        string root "the project root"
        Registry registry
        string[] skipped
        PluginFailure[] failures
    }
    Registry {
        Rule[] rules
        Rule[] fixOrder
        LoadedSource[] sources
    }
    RunFlags {
        string preset "optional"
        string profile "optional"
        CanvasSetting canvas "optional"
    }
    Collected {
        string[] files
        string[] unreadable
        string[] symlinks
    }
    DocModel {
        enum kind "markdown or diagram"
        Diagram[] diagrams
    }
    Rule {
        RuleId id
        string category
    }
    Finding {
        string file
        number line
        number endLine
        RuleId rule
        string message
        string remediation "optional"
    }
    FixReport {
        string output
        Edit[] applied
        Edit[] refused
    }
    Edit {
        number start
        number end
        string text
        Expectation expect
    }
    PluginFailure {
        string source
        enum kind "local package config"
        PluginLoadError error
    }
    LoadedSource {
        enum kind "local package config"
        string spec
        string namespace
    }
    JsonReport {
        Finding[] findings
        number files
        LoadedSource[] plugins
        object[] skippedPlugins "source, kind, code, message"
        string[] canvasSetAside
    }

    classDef setupTint fill:#1d4ed836,stroke:#3b82f6,stroke-width:2px
    classDef docTint fill:#15803d36,stroke:#22c55e,stroke-width:2px
    classDef outTint fill:#b4530936,stroke:#d97706,stroke-width:2px
    classDef failTint fill:#dc262636,stroke:#ef4444,stroke-width:2px
    classDef pluginTint fill:#6d28d936,stroke:#8b5cf6,stroke-width:2px
    class SetupOptions,Setup,Registry,RunFlags setupTint
    class Collected,DocModel,Rule docTint
    class Finding,FixReport,Edit,JsonReport outTint
    class PluginFailure failTint
    class LoadedSource pluginTint
```

</details>
