# Sequence note on Mermaid's dark theme

<!-- expect: contrast-text-below-aa -->

A sequence diagram with no overrides and a note.
Mermaid's dark theme draws note text at 4.49 to 1 on the note box, just under AA.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    C->>S: Request
    Note over C,S: Retries twice
    S-->>C: Response
```
