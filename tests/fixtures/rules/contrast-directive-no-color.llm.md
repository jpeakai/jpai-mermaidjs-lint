# Fill with no label colour

<!-- llm: The dark navy fill needs light text, so the class declares white, which reads at well over 4.5 to 1. -->

```mermaid
flowchart LR
  A --> B
  classDef c fill:#123456,color:#ffffff
  class A c
```
