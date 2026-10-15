# Document model

The parsed file every rule reads, passed to a rule as `ctx.doc`.
[How a run works](../concepts/how-it-works.md#structure-comes-from-mermaids-own-parsers) explains why it is built this way.
The types are exported from `@jpeakai/mermaidjs-lint`.

## Overview

A markdown file is parsed to one mdast tree, then flattened to the diagrams in it, so every rule reads the same model.

--8<-- "document-model.md"

??? info "Detailed: every field of the document model"

    Each entity carries the fields its TypeScript interface declares, and the contrast rules score a directive into pairs that each hold one assessment.

    --8<-- "document-model-detail.md"

## DocModel

One parsed file.

| Field | Type | Meaning |
|---|---|---|
| `src` | `string` | The whole file, as read. Edit offsets index into it. |
| `kind` | `"markdown"` or `"diagram"` | `diagram` for a `.mmd` file, otherwise `markdown` |
| `tree` | mdast `Root` | The markdown tree, parsed with GFM and YAML or TOML frontmatter |
| `diagrams` | `Diagram[]` | Every mermaid fence in document order, or the one diagram of a `.mmd` file |

## Diagram

One mermaid source.

| Field | Type | Meaning |
|---|---|---|
| `index` | `number` | Position in `doc.diagrams`, from 0 |
| `source` | `string` | The diagram text. Inside a list or a quote, the indentation is already removed. |
| `keyword` | `string` or `null` | The first word of the diagram, such as `flowchart`, past any frontmatter and comments |
| `startLine`, `endLine` | `number` | The file lines a finding points at: the fences, or the whole `.mmd` file |
| `firstLine` | `number` | The file line of the first line of `source` |
| `terminated` | `boolean` | `false` when the fence runs to the end of the file without closing |
| `endOffset` | `number` | The offset in `doc.src` where the fence ends |
| `directives` | `StyleDirective[]` | Every style line in the diagram |
| `offsetOf(span)` | `number` or `null` | The offset in `doc.src` of a directive value, or `null` when it cannot be mapped back |
| `stats()` | `Promise<DiagramStats>` | Structure as mermaid's parser reads it, parsed once on first call and shared by every rule |

!!! tip "A fixer must use `offsetOf`"

    `source` is not a slice of `doc.src` when the fence is indented, so a value's position in `source` is not its position in the file.
    `offsetOf` maps it back, and returns `null` when it cannot, in which case the fixer should propose nothing.

## StyleDirective

One `classDef`, `style` or `linkStyle` line, or an inline `:::class` application.

| Field | Type | Meaning |
|---|---|---|
| `kind` | `"classDef"`, `"style"`, `"linkStyle"` or `"inlineClass"` | Which form the line takes |
| `selector` | `string` | The class name, node id or link index the directive applies to |
| `class_name` | `string`, optional | The class applied, for an inline class |
| `properties` | `Record<string, string>` | Each property, such as `fill` and `color`, to its value |
| `spans` | `Record<string, ValueSpan>` | Each property to where its value sits in `source` |
| `line` | `number` | The line within the diagram, from 1 |

## ValueSpan

Where a property value sits in the diagram source.

| Field | Type | Meaning |
|---|---|---|
| `line` | `number` | The line within the diagram, from 1 |
| `start`, `end` | `number` | The column range of the value on that line |

## DiagramStats

What mermaid's parser reads from a diagram.

| Field | Type | Meaning |
|---|---|---|
| `nodes`, `edges`, `subgraphs` | `number` | Counts of each |
| `max_subgraph_depth` | `number` | The deepest subgraph nesting |
| `node_ids`, `subgraph_names` | `string[]` | Identifiers, used to suggest where to split |
| `parser_used` | `"langium"`, `"mermaid-core"` or `"custom"` | Which parser produced the result |
| `diagram_type` | `string` | The type the parser recognised |
| `error` | `string` or `null` | The parser's reason, when no parser produced structure |

## Building a model yourself

```ts
import { buildDocModel } from "@jpeakai/mermaidjs-lint";

const doc = buildDocModel(markdown);              // a markdown file
const one = buildDocModel(diagramText, "diagram"); // a .mmd file
const stats = await doc.diagrams[0]?.stats();
```
