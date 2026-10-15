# Sequence message text tuned for a light page

<!-- llm: Message text, arrows and the human actor's label sit on the page, so they keep the theme's own colours, which flip with the reader. The note keeps its own box, where white on slate reads in both themes. -->

```mermaid
---
config:
  themeVariables:
    noteBkgColor: "#475569"
    noteTextColor: "#ffffff"
---
sequenceDiagram
    actor R as Reviewer
    participant V as Viewer
    R->>V: Mark section reviewed
    Note over R,V: In memory only
```
