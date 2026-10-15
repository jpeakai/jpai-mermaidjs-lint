# Concepts

These pages explain why the tool behaves as it does.
Read them away from the keyboard: none of them asks you to run anything.

## The four tenets

The tool exists to make four guarantees about every diagram it passes.
Each concept page explains how one of them is kept, and where its limits are.

| Tenet | The guarantee | Its limit | Explained in |
|---|---|---|---|
| **Readable in light and dark** | Every label can be read against its fill, in both light and dark themes, as the host renders it | It scores declared colours, so a diagram with no styling is not checked | [Contrast profiles](contrast.md) |
| **Renders** | Every diagram parses with mermaid's own parsers, the ones its renderer runs, and every fence is closed | It parses rather than draws, so a layout that draws badly is not caught | [How a run works](how-it-works.md) |
| **Simple enough to follow** | Visual complexity is scored against a density preset, so an oversized diagram is flagged to be split | It flags and suggests where to split, but never splits | [Measuring complexity](complexity.md) |
| **Extensible** | A plugin system adds rules of your own, which load, run and fix exactly like the built-ins | A plugin is code that runs on your machine, so trust what you install | [The plugin model](plugin-model.md) |

A rule that serves none of the four does not belong in the tool.

## Pages

| Page | Question it answers |
|---|---|
| [How a run works](how-it-works.md) | What happens between the command and the exit code, and why a fix can be trusted |
| [The plugin model](plugin-model.md) | Where rules come from, how they are checked, and what stops two plugins colliding |
| [Contrast profiles](contrast.md) | Why the same diagram can pass on GitHub and fail on a MkDocs site |
| [Measuring complexity](complexity.md) | What a node count and a visual complexity score measure, and why neither is fixed automatically |

The decisions behind each choice are recorded as [decision records](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/index.md) in the repository.
