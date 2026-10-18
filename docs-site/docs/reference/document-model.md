# Document model

The parsed file every rule reads, passed to a rule as `ctx.doc`.
[How a run works](../concepts/how-it-works.md#structure-comes-from-mermaids-own-parsers) explains why it is built this way.
The types are exported from `@jpeakai/mermaidjs-lint`.

## Overview

A markdown file is parsed to one mdast tree, then flattened to the diagrams in it, so every rule reads the same model.

--8<-- "document-model.md"

??? info "Detailed: every field of the document model"

    Each exported type carries the fields its TypeScript interface declares, and the contrast rules score a directive into pairs that each hold one assessment.
    `ContrastPair` is internal and not exported, so the diagram shows it abridged.

    --8<-- "document-model-detail.md"

    `ContrastPair` also holds these fields, which the diagram leaves out:

    | Field | Type | Meaning |
    |---|---|---|
    | `selector` | `string` | The class, node or variable the pair was scored for |
    | `directive` | `StyleDirective`, or a `themeVariables` source | What the pair was scored from |
    | `line` | `number` | The line within the diagram text |
    | `theme` | `"light"` or `"dark"`, optional | The theme the pair was scored in |
    | `row` | `"odd"` or `"even"`, optional | The `erDiagram` row the pair was scored on |
    | `advisory` | `boolean`, optional | A border pair that is scored but never gates |

## DocModel

One parsed file.

| Field | Type | Meaning |
|---|---|---|
| `src` | `string` | The whole file, as read. Edit offsets index into it. |
| `kind` | `"markdown"` or `"diagram"` | `diagram` for a `.mmd` or `.mermaid` file, otherwise `markdown` |
| `tree` | mdast `Root` | The markdown tree, parsed with GFM and YAML or TOML frontmatter. For kind `diagram`, an empty root. |
| `diagrams` | `Diagram[]` | Every mermaid fence in document order, or the one diagram of a raw diagram file |

## Diagram

One mermaid source.

| Field | Type | Meaning |
|---|---|---|
| `index` | `number` | Position in `doc.diagrams`, from 0 |
| `source` | `string` | The diagram text. Inside a list or a quote, the indentation is already removed. |
| `keyword` | `string` or `null` | The keyword of the diagram type mermaid detects, such as `flowchart` or `erDiagram`, or `null` when it detects none. A type declared two ways has one keyword, so `graph` is `flowchart`. |
| `startLine`, `endLine` | `number` | The file lines a finding points at: the fences, or the whole raw diagram file |
| `firstLine` | `number` | The file line of the first line of `source` |
| `terminated` | `boolean` | `false` when the fence has no closing fence, so it runs to the end of the file or of its quote or list item |
| `closingFence` | `string` or `null` | The line that closes the fence: its opening fence, after the quote markers and indentation before it. `null` for a raw diagram file, and when the opening line holds anything else before the fence, such as a list item's marker. |
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
| `start`, `end` | `number` | The column range of the value on that line, from 0, with `end` exclusive |

## DiagramStats

What mermaid's parser reads from a diagram.

| Field | Type | Meaning |
|---|---|---|
| `nodes`, `edges`, `subgraphs` | `number` | Counts of each |
| `max_subgraph_depth` | `number` | The deepest subgraph nesting, such as a `subgraph` inside a `subgraph` or a composite state inside another |
| `max_tree_depth` | `number` | How far a `mindmap`, `treemap`, `treeView` or `ishikawa` reaches below its root, and 0 for every other type. Tree depth is not subgraph nesting. |
| `rows` | `number` | The rows drawn inside a node: an `erDiagram` entity's attributes and a `classDiagram` class's attributes and methods. It is 0 for every other type. |
| `node_ids`, `subgraph_names` | `string[]` | Identifiers, used to suggest where to split |
| `parser_used` | `"langium"` or `"mermaid-core"` | Which parser produced the result, or on a failure, the parser whose reason `error` carries |
| `diagram_type` | `string` | The type the parser recognised, as mermaid's detection names it. On a failure it is the type's keyword, or `unknown` when mermaid detects no type. |
| `error` | `string` or `null` | The parser's reason on one line, when no parser produced structure. Its line numbers count from the diagram's first line. |
| `error_line` | `number` or `null`, optional | The diagram line the parser's error points at, from the diagram's first line, or `null` when it points at none |

## ContrastAssessment

How the contrast rules score one foreground on one background.
A rule does not receive it, but the type is exported for code that scores colours the same way.

| Field | Type | Meaning |
|---|---|---|
| `foreground`, `background` | `string` | The two colours, as scored |
| `ratio` | `number` | The WCAG 2.x contrast ratio, from 1 to 21, rounded to two decimal places |
| `rating` | `"AAA"`, `"AA"`, `"AA Large"` or `"Fail"` | The WCAG level the ratio reaches |
| `apca_lc` | `number` | The APCA lightness contrast, for reference |

## Building a model yourself

```ts
import { buildDocModel } from "@jpeakai/mermaidjs-lint";

const doc = buildDocModel(markdown);              // a markdown file
const one = buildDocModel(diagramText, "diagram"); // a .mmd file
const stats = await doc.diagrams[0]?.stats();
```
