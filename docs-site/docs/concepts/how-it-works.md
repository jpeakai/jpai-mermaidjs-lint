# How a run works

A diagram linter has two hard problems.
Text patterns disagree with the renderer about what a diagram contains, and an automatic fix can quietly break a document.
This page explains how a run avoids both.

## One setup, then one model per file

A run sets up once, then reads each file into a document model that every rule shares.

--8<-- "run-pipeline.md"

??? info "Detailed: setup, the fixpoint loop and the check"

    Every accepted edit restarts the pass on a fresh model, because offsets only hold for the source they came from.

    --8<-- "run-pipeline-detail.md"

Setup happens before any file is read.
The run first finds the project root.
That is the nearest ancestor of the working directory holding a `package.json`, a config file or a `.mermaidjs-lint` folder.
It reads the config there, loads the plugins, and builds one registry of active rules.
A bad config or a broken plugin therefore stops the run before it touches a document.

Setup turns the flags and the config into one registry, and a category flag has the last word over the config.

--8<-- "run-setup.md"

??? info "Detailed: config, plugin mode and registry"

    The config turns rules off and sets their options, then `--category` and `--disable-category` switch whole categories for this run.

    --8<-- "run-setup-detail.md"

## Structure comes from mermaid's own parsers

Each file is parsed to a markdown tree once.
The mermaid fences in that tree become the diagrams every rule reads.
A check and a fix therefore never disagree about which text is a diagram.
A `.mmd` or `.mermaid` file is one diagram with no markdown around it.

A rule that needs structure asks the diagram for its stats.
For the newer diagram types, the parse engine reads them from mermaid's Langium grammars.
For the rest, it reads them from mermaid's own core, under a DOM shim.
A regular expression would miscount subgraphs, ports and multi-line labels, and the counts would differ from what a reader sees.
The parse happens once per diagram, on first use, and every rule shares the result.

A diagram whose parser reports an error is reported as `parse-diagram-unparseable`, on one line or many.
The finding carries the parser's reason, and its line numbers count from the diagram's first line.
Having no nodes is not an error on its own, so a valid `pie` with only a title line, or `info`, passes.
A `zenuml` diagram is always reported, because it is drawn by a mermaid add-on this package does not include.
A diagram that opens with the `flowchart-elk` keyword is a flowchart drawn with the ELK layout, so it is read and measured as a flowchart.

The diagram type comes from mermaid's own detection, which looks past frontmatter, directives and comments, and it picks which parser runs.
A diagram whose type mermaid does not detect is reported as `parse-diagram-unparseable`.
Whether a fence is closed, and the line that would close it, come from micromark's reading of the markdown.

Style directives are read from the parser's result: the classes, node styles and link styles mermaid's DB holds, with the classes each node carries.
Each statement is placed by the lexer token that opens it, so a fixer can rewrite a value in place.
A value the parser cannot place is never rewritten.
Text inside a label is never read as a directive, and a style joined to other statements by a semicolon is read like any other.

The [document model reference](../reference/document-model.md) lists every field.

## Checking runs every rule at once

No rule reads another rule's result, so a check starts every rule together and waits for all of them.
A rule may return its findings directly or as a promise.
The findings are then sorted by line and rule id, so output is stable from run to run.

Every file is read, modelled and checked at the same time, and any finding left makes the run exit 1.

--8<-- "check-run.md"

??? info "Detailed: file walk, shared stats and the report"

    A rule asks the parse engine for stats on first use, and every other rule reads the same result.

    --8<-- "check-run-detail.md"

## Fixing is a loop with a check

`--fix` does not trust a fixer.
A fixer proposes edits: a span of the source, its replacement, and an expectation of what must stay the same.

| Expectation | What must hold after the edit |
|---|---|
| `same-diagrams` | The markdown is unchanged outside the mermaid fences, once whitespace in text is collapsed, and the document holds the same number of diagrams. Each keeps its keyword, whether it parses, its type, counts, rows, deepest nesting and tree depth, node ids and subgraph names. |
| `same-tree` | The markdown tree is identical, except for whitespace in prose text. Mermaid fence bodies must match exactly, and no diagram that parsed may stop parsing. A raw diagram file has an empty tree, so there the diagram must also pass the `same-diagrams` check. |

The engine splices the edits, parses the whole document again, and keeps the change only when every expectation holds.
Neither expectation lets an edit turn a diagram that parses into one that does not.
`same-diagrams` is a structural check, and it does not show that nothing else changed.
It does not compare edges, labels, node text or styles, so a fixer that declares it must keep those intact itself.
[Edits](../reference/plugin-api.md#edits) lists exactly what each expectation compares.
A rule's edits are first tried as one batch.
When the batch fails, each edit is tried alone, so one bad edit never blocks the others.
An edit that fails is refused, remembered, and never proposed again for the same text.

After any accepted change the engine starts a new pass on the new source, because every offset a fixer computed belongs to the old one.
The loop ends when no fixer makes progress.
The file is then written, and checked like any other.
A fixer that never stops proposing edits stops the run after 1000 passes with [`error[fix-not-converging]`](../reference/cli.md#error-codes), and that file is not written.

Each pass keeps an edit only when the verifier accepts it, and a refused edit leaves the text alone.

--8<-- "fix-loop.md"

??? info "Detailed: batches, both expectations and what is not compared"

    The verifier compares only what each expectation lists, so edge endpoints, edge labels and node text are the fixer's own responsibility.

    --8<-- "fix-loop-detail.md"

!!! warning "A refused edit leaves the finding in place"

    When a fixer is unsure, or its edit fails the check, the text is left alone and the finding is still reported.
    That is deliberate: a fix that might change what a diagram says needs a human.

## What a run does not do

- It never renders a diagram, so layout problems a renderer would show are out of reach.
- It never splits or restructures a diagram, because that changes what the diagram says.
- It never picks a brand colour. The only colour fix swaps a declared label colour for black or white.
