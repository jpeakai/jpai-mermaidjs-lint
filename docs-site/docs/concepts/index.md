# Concepts

These pages explain why the tool behaves as it does.
Read them away from the keyboard: none of them asks you to run anything.

## The four tenets

Three tenets are guarantees about every diagram the tool passes, and the fourth is a commitment about the tool.
Each concept page explains how one of them is delivered, and where its limits are.

--8<-- "tenets.md"

| Tenet | Delivered by | Its limit | Explained in |
|---|---|---|---|
| **Readable in light and dark** | The contrast rules | Only declared colours are scored, except in a `sequenceDiagram`, whose theme colours are resolved too. An unstyled node, a theme setting outside a `sequenceDiagram`, a `linkStyle` `stroke:`, a fill-less `stroke:`, a fill-less `color:` outside an `erDiagram`, and the `color:` and `stroke:` on a fully transparent fill are not. A border under `mkdocs-material` or in an `erDiagram` is scored but never reported. Under `mkdocs-material`, Material forces every sequence label, so no sequence text is scored there. | [Contrast profiles](contrast.md) |
| **Renders** | The parse rules | It parses rather than draws, and a host on another mermaid version may still fail to draw it. A diagram after an unclosed fence of another language is not seen. | [How a run works](how-it-works.md) |
| **Simple enough to follow** | The complexity rules | It flags and suggests where to split, but never splits | [Measuring complexity](complexity.md) |
| **Extensible** | Local rules and plugin packages | A plugin is code that runs on your machine, so trust what you install | [The plugin model](plugin-model.md) |

A rule that serves none of the four does not belong in the tool.

## Pages

| Page | Question it answers |
|---|---|
| [How a run works](how-it-works.md) | What happens between the command and the exit code, and why a fix can be trusted |
| [The plugin model](plugin-model.md) | Where rules come from, how they are checked, and what stops two plugins colliding |
| [Contrast profiles](contrast.md) | Why the same diagram can pass on GitHub and fail on a MkDocs site |
| [Measuring complexity](complexity.md) | What a node count and a visual complexity score measure, and why neither is fixed automatically |
| [Summarising a diagram](summarisation.md) | How a split plan folds an oversized diagram into an overview and its details, and what it promises to keep |

The decisions behind each choice are recorded as [decision records](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/index.md) in the repository.
