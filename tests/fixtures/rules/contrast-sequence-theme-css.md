# Sequence colours set by themeCSS

<!-- expect: contrast-directive-unauditable -->

A sequence diagram restyles its message text with `themeCSS`.
The audit reads theme variables, not CSS, so it cannot score the result.

```mermaid
---
config:
  themeCSS: ".messageText { fill: #475569 }"
---
sequenceDiagram
    participant C as Client
    participant S as Server
    C->>S: Request
    S-->>C: Response
```
