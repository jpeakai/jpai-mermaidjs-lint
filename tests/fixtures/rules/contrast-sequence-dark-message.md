# Sequence message text tuned for a light page

<!-- expect: contrast-text-below-aa contrast-border-below-ui-minimum -->

A sequence diagram pins the `base` theme and sets slate message text and arrows.
They read on a white page but fade on a dark one, because the SVG is transparent and messages sit on the page.
The human actor's white label sits on the page too, so it vanishes in light.

```mermaid
---
config:
  theme: base
  themeVariables:
    actorBkg: "#2563eb"
    actorTextColor: "#ffffff"
    actorBorder: "#1e40af"
    signalColor: "#475569"
    signalTextColor: "#475569"
    noteBkgColor: "#475569"
    noteTextColor: "#ffffff"
---
sequenceDiagram
    actor R as Reviewer
    participant V as Viewer
    R->>V: Mark section reviewed
    Note over R,V: In memory only
```
