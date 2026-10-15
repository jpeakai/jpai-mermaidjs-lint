# Fill with no label colour

A fill with no `color:` beside it cannot be audited, so it is reported rather than skipped.

```mermaid
flowchart LR
  A --> B
  classDef c fill:#123456
  class A c
```
