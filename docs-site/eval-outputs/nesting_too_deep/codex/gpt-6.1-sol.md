# Subgraphs nested three deep

```mermaid
flowchart LR
  subgraph L1[Level one]
    subgraph L2[Level two / Level three]
      A --> B
    end
  end
```
