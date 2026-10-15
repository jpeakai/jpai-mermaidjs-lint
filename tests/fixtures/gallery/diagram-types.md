# Diagram type gallery

<!-- expect: none -->

One example of each diagram type the linter can measure.
Most examples are adapted from mermaid's own demo pages and syntax docs.
Every diagram here must lint clean:

```bash
bunx @jpeakai/mermaidjs-lint tests/fixtures/gallery/diagram-types.md
```

From a clone of this repo, `bun run src/bin.ts tests/fixtures/gallery/diagram-types.md` does the same, and exits 0.

**Purpose**

- It guards the parse engine: if mermaid stops parsing a type, its diagram here reports `parse-diagram-unparseable`.
- It records which types parse through the Langium grammars in `@mermaid-js/parser`, and which through the older JISON grammars in mermaid core.
- It gives readers a one-page index of what mermaid can draw.

---

## Langium-parsed diagrams

These grammars return a typed syntax tree and need no DOM.

### architecture-beta

```mermaid
architecture-beta
  group api(cloud)[API]
  service db(database)[Database] in api
  service server(server)[Server] in api
  db:L -- R:server
```

### gitGraph

```mermaid
gitGraph LR:
  commit
  branch newbranch
  checkout newbranch
  commit
  checkout main
  merge newbranch
```

### info

`info` draws no nodes.
The parse rule flags a diagram the parser reports an error for, or a mermaid-core diagram read as zero nodes from several lines.
This one-line diagram is neither, so it passes.

```mermaid
info
```

### packet-beta

```mermaid
packet-beta
  0-15: "Source Port"
  16-31: "Destination Port"
  32-63: "Sequence Number"
```

### pie

```mermaid
pie title Animal adoption
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15
```

### radar-beta

```mermaid
radar-beta
  title My favorite ninjas
  axis Agility, Speed, Strength
  axis Stam["Stamina"], Intel["Intelligence"]
  curve Ninja1["Naruto"]{Agility 2, Speed 2, Strength 3, Stam 5, Intel 0}
  showLegend true
```

### treemap

```mermaid
treemap
"Root"
    "Branch 1"
        "Leaf 1.1": 10
        "Leaf 1.2": 15
```

### treeView-beta

```mermaid
treeView-beta
  "docs"
    "build"
    "source"
      "static"
```

### wardley-beta

```mermaid
wardley-beta
  title Tea Shop
  anchor Business [0.95, 0.63]
  component Cup of Tea [0.85, 0.62] label [0, 0]
  component Tea Leaves [0.43, 0.12] label [0, 0]
  Business -> Cup of Tea
  Cup of Tea -> Tea Leaves
```

---

## JISON-parsed diagrams

The older grammars in mermaid core expect a browser.
The linter runs them under a happy-dom shim, then reads each type's parsed result.

### block

```mermaid
block
columns 1
  db(("DB"))
  block:ID
    A
    B
  end
```

### C4Context

```mermaid
C4Context
  title System Context diagram
  Enterprise_Boundary(b0, "BankBoundary0") {
    Person(customerA, "Banking Customer A", "A customer")
    System(SystemAA, "Internet Banking System", "Allows customers")
  }
  BiRel(customerA, SystemAA, "Uses")
```

### classDiagram

```mermaid
classDiagram
  Animal <|-- Duck
  Animal <|-- Fish
  Animal : +int age
  class Duck {
    +String beakColor
    +swim()
  }
```

### erDiagram

```mermaid
erDiagram
  CAR ||--o{ NAMED-DRIVER : allows
  CAR {
    string registrationNumber PK
    string make
  }
```

### flowchart

```mermaid
flowchart LR
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Fail]
```

### gantt

```mermaid
gantt
  title A Gantt Diagram
  dateFormat YYYY-MM-DD
  section Section
  A task :a1, 2014-01-01, 30d
  Another :after a1, 20d
```

### ishikawa-beta

```mermaid
ishikawa-beta
  Blurry Photo
  Process
    Out of focus
    Shutter speed too slow
  User
    Shaky hands
```

### kanban

```mermaid
kanban
  Todo
    [Task 1]
    [Task 2]
  Doing
    [Task 3]
  Done
    [Task 4]
```

### mindmap

```mermaid
mindmap
  root((Mind map))
    Origins
      Long history
      Popular
    Research
      On effectiveness
    Tools
      Pen and paper
```

### quadrantChart

```mermaid
quadrantChart
  title Reach and engagement of campaigns
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 We should expand
  quadrant-2 Need to promote
  quadrant-3 Re-evaluate
  quadrant-4 May be improved
```

### requirementDiagram

```mermaid
requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req
```

### sankey-beta

```mermaid
sankey-beta
iPhone,Products,205
Mac,Products,40
Products,Revenue,315
Services,Revenue,60
```

### sequenceDiagram

```mermaid
sequenceDiagram
  participant Alice
  participant Bob
  Alice ->> Bob: Hello Bob, how are you?
  Bob -->> Alice: Great, thanks!
```

### stateDiagram

```mermaid
stateDiagram-v2
  [*] --> Still
  Still --> Moving
  Moving --> Still
  Moving --> Crash
  Crash --> [*]
```

### timeline

```mermaid
timeline
  title History of Social Media
  section 2002-2006
    2002 : LinkedIn
    2004 : Facebook
  section 2007-2009
    2007 : iPhone
```

### journey

```mermaid
journey
  title My working day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me
    Do work: 1: Me, Cat
  section Go home
    Go downstairs: 5: Me
    Sit down: 5: Me
```

### venn-beta

```mermaid
venn-beta
  title Very Basic Venn Diagram
  set A
  set B
  union A,B["AB"]
```

### xychart-beta

```mermaid
xychart-beta
  title Sales Revenue
  x-axis [jan, feb, mar]
  y-axis Revenue 4000 --> 11000
  bar [5000, 6000, 7500]
  line [5000, 6000, 7500]
```
