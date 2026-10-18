// Each case the adversarial review and the semantic oracle found a plan
// getting wrong. A case must now give a plan that reads back whole from its
// emitted sources (faithful.ts), or no plan with a reason.

import { describe, expect, test } from "bun:test";
import { configFromPreset } from "../../src/parse/metrics.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { faithful } from "./faithful.ts";

// The larger random cases walk two ladders and parse every emitted source,
// which takes longer than bun's default under a full coverage run.
const SLOW = 30_000;

const CASES: Array<{ name: string; title: string; preset: string; source: string }> = [
  {
    name: "html-label",
    title: "a label's text around HTML tags comes back whole",
    preset: "low-density",
    source:
      'flowchart TD\n  A["Start"] --> B["Use <b>bold</b> carefully"]\n  B --> C["Line one<br>Line two"]\n  C --> D["Step D"]\n  D --> E["Step E"]\n  E --> F["Step F"]\n  F --> G["Step G"]\n  G --> H["Step H"]\n  H --> I["Step I"]\n  I --> J["Step J"]\n  J --> K["Step K"]\n  K --> M["Step M"]\n  B --> E\n  D --> H\n  F --> K',
  },
  {
    name: "lt-label",
    title: "a transition label holding < comes back",
    preset: "low-density",
    source:
      "stateDiagram-v2\n  [*] --> A\n  A --> B : n < 10\n  A --> C : n >= 10\n  B --> D\n  C --> D\n  D --> E\n  E --> F\n  F --> G\n  G --> H\n  H --> I\n  I --> J\n  J --> K\n  K --> M\n  M --> N\n  N --> O\n  O --> [*]",
  },
  {
    name: "markdown",
    title: "a markdown label comes back as markdown",
    preset: "low-density",
    source:
      'flowchart LR\n  A["`**Bold** start`"] --> B["`_italic_ step`"]\n  B --> C["`**a** and _b_`"]\n  C --> D["`plain`"]\n  D --> E["`more **md**`"]\n  E --> F["`F`"]\n  F --> G["`🚀 **rocket**`"]\n  G --> H["`H`"]\n  H --> I["`I`"]\n  I --> J["`J`"]\n  J --> K["`K`"]\n  K --> M["`M`"]\n  A --> F\n  C --> I\n  B -->|"`**edge md**`"| G',
  },
  {
    name: "composite-start",
    title: "a composite's start marker stays in its composite",
    preset: "low-density",
    source:
      "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Work\n  state Work {\n    [*] --> w0\n    Retry --> w0\n    w0 --> w1\n    w1 --> w2\n    w2 --> w3\n    w3 --> w4\n    w4 --> w5\n    w5 --> w6\n    w6 --> w7\n    w7 --> w8\n    w8 --> w9\n    w9 --> w10\n    w10 --> w11\n    w11 --> w12\n    w12 --> w13\n    w13 --> w14\n    w14 --> [*]\n  }\n  Work --> Done\n  Done --> [*]",
  },
  {
    name: "composite-start-medium",
    title: "a composite's start marker stays in its composite at medium density",
    preset: "medium-density",
    source:
      "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Work\n  state Work {\n    [*] --> w0\n    Retry --> w0\n    w0 --> w1\n    w1 --> w2\n    w2 --> w3\n    w3 --> w4\n    w4 --> w5\n    w5 --> w6\n    w6 --> w7\n    w7 --> w8\n    w8 --> w9\n    w9 --> w10\n    w10 --> w11\n    w11 --> w12\n    w12 --> w13\n    w13 --> w14\n    w14 --> [*]\n  }\n  Work --> Done\n  Done --> [*]",
  },
  {
    name: "dup-edge",
    title: "an edge written twice comes back twice",
    preset: "low-density",
    source:
      "flowchart LR\n  a --> b\n  a --> b\n  b --> c1\n  b --> c2\n  b --> c3\n  b --> c4\n  b --> c5\n  b --> c6\n  c1 --> d\n  c2 --> d\n  c3 --> d\n  c4 --> d\n  c5 --> d\n  c6 --> d\n  d --> e\n  e --> f",
  },
  {
    name: "marker-label",
    title: "a start or end transition keeps its label",
    preset: "low-density",
    source:
      "stateDiagram-v2\n  [*] --> A\n  A --> B\n  B --> C\n  C --> D\n  D --> E\n  E --> F\n  F --> G\n  G --> Comp\n  state Comp {\n    [*] --> X1\n    X1 --> X2\n    X2 --> X3\n    X3 --> X4\n    X4 --> [*] : finished\n  }\n  Comp --> H\n  H --> I\n  I --> [*]",
  },
  {
    name: "random-state-93",
    title: "start markers inside composites stay there",
    preset: "medium-density",
    source:
      'stateDiagram-v2\n  state "Index api" as S_n0\n  state "Auth" as S_n1\n  state "Gateway db" as S_n9\n  state "Worker job" as S_n10\n  state "Gateway api" as S_n11\n  state "Mail (+2)" as S_n12\n  state "Auth" as S_n13\n  state "Index" as S_n14\n  state "Mail job" as S_n15\n  state "Worker (Report)" as S_n16\n  state "Billing service" as S_n17\n  state "Dup label" as S_n23\n  state CR0 {\n    state "Billing job" as S_n2\n    state "Queue" as S_n3\n    state "Search (+2)" as S_n4\n    state "Queue" as S_n5\n    state "Store job" as S_n6\n    state "Index service" as S_n7\n    state "Ledger job" as S_n8\n    [*] --> S_n2\n  }\n  state CR2 {\n    state "Gateway store" as S_n18\n    state "n19" as S_n19\n    state "Gateway db" as S_n20\n    state "Auth service" as S_n21\n    state "Order service" as S_n22\n    [*] --> S_n18\n  }\n  [*] --> S_n0\n  S_n0 --> S_n1\n  S_n1 --> S_n2\n  S_n2 --> S_n3\n  S_n0 --> S_n4\n  S_n0 --> S_n5\n  S_n1 --> S_n7\n  S_n3 --> S_n8\n  S_n0 --> S_n9\n  S_n6 --> S_n11\n  S_n8 --> S_n12 : calls\n  S_n10 --> S_n13\n  S_n9 --> S_n14\n  S_n14 --> S_n15\n  S_n8 --> S_n16\n  S_n8 --> S_n17\n  S_n17 --> S_n19\n  S_n8 --> S_n20\n  S_n5 --> S_n21\n  S_n22 --> S_n23 : has\n  S_n1 --> S_n7\n  S_n18 --> S_n14 : reads\n  S_n8 --> S_n10\n  S_n1 --> S_n13 : writes\n  S_n23 --> [*]\n  S_n5 --> CR0',
  },
  {
    name: "random-class-123",
    title: "stubs for nodes sharing a label stay distinct",
    preset: "medium-density",
    source:
      'classDiagram\n  class K_n0\n  class K_n1\n  class K_n2\n  class K_n3\n  class K_n4["Cache service"]\n  class K_n5\n  class K_n6["Queue db"]\n  class K_n7["Cache service"]\n  class K_n8\n  class K_n9\n  class K_n10\n  class K_n11\n  class K_g1\n  class K_n13\n  class K_n14\n  class K_n15\n  class K_n16\n  class K_n17\n  class K_n18["Payment service"]\n  class K_n19\n  class K_s1["Cache job"]\n  class K_n21\n  class K_n22["Order store"]\n  class K_n23\n  class K_n24["Auth"]\n  class K_n25\n  class K_n26\n  class K_n27\n  class K_n28\n  class K_n29\n  class K_n30\n  class K_n31\n  class K_n32["Auth db"]\n  class K_n33\n  class K_n34["Payment db"]\n  class K_n35["Dup label"]\n  class K_n36\n  class K_n37\n  class K_n38["Queue job"]\n  class K_n39\n  class K_n40\n  class K_n41["Audit api"]\n  class K_n42\n  class K_n43\n  class K_n44\n  class K_n45\n  class K_n46\n  K_n0 <|-- K_n1 : reads\n  K_n1 ..|> K_n3 : reads\n  K_n2 ..> K_n4 : emits\n  K_n1 ..|> K_n5 : calls\n  K_n0 --> K_n6 : emits\n  K_n3 --> K_n8\n  K_n7 <|-- K_n9\n  K_n8 -- K_n10\n  K_n7 o-- K_g1 : reads\n  K_n1 o-- K_n13\n  K_n6 <|-- K_n14\n  K_n10 o-- K_n16\n  K_n1 <|-- K_n17 : writes\n  K_n14 *-- K_n18\n  K_n16 -- K_n19\n  K_n10 "1" <|-- "*" K_s1 : emits\n  K_n8 "1" ..|> "*" K_n21 : has\n  K_n13 --> K_n22\n  K_n14 "1" -- "*" K_n23\n  K_n6 *-- K_n24\n  K_n21 <|-- K_n25\n  K_n3 --> K_n26\n  K_n24 o-- K_n27\n  K_n18 -- K_n28 : has\n  K_n7 ..|> K_n29 : writes\n  K_n14 o-- K_n30\n  K_n4 --> K_n31\n  K_n23 <|-- K_n32 : writes\n  K_s1 <|-- K_n33\n  K_n18 --> K_n35 : has\n  K_n17 "1" --> "*" K_n36\n  K_n2 o-- K_n37 : writes\n  K_n9 o-- K_n38\n  K_n13 -- K_n39\n  K_n33 o-- K_n41\n  K_n17 "1" ..> "*" K_n42\n  K_s1 ..|> K_n43\n  K_n17 "1" ..> "*" K_n45\n  K_n42 *-- K_n46\n  K_n29 "1" o-- "*" K_n44\n  K_n15 <|-- K_n10 : writes\n  K_n46 "1" --> "*" K_n45\n  K_n18 "1" o-- "*" K_n40\n  K_n16 "1" --> "*" K_n34 : writes\n  K_n17 ..> K_g1 : calls\n  K_n6 ..|> K_n26\n  K_n38 o-- K_n19\n  K_n4 <|-- K_n9\n  K_n0 ..|> K_n34\n  K_n16 "1" ..> "*" K_n24\n  K_n29 <|-- K_n2 : emits',
  },
  {
    name: "random-class-59",
    title: "stubs for nodes sharing a label stay distinct at low density",
    preset: "low-density",
    source:
      'classDiagram\n  class K_n0["Search db"]\n  class K_n1\n  class K_n2\n  class K_n3["Queue api"]\n  class K_n4\n  class K_n5\n  class K_n6\n  class K_n7["n7"]\n  class K_s1\n  class K_n9\n  class K_n10\n  class K_n11\n  class K_n16\n  class K_n25\n  class K_n26\n  class K_n27\n  class K_n28["Dup label"]\n  class K_n29\n  namespace R0 {\n    class K_n12\n    class K_n13\n    class K_n14\n    class K_n15\n  }\n  namespace R1 {\n    class K_n17\n    class K_n18["Queue api"]\n    class K_n19\n    class K_n20["Report api"]\n    class K_n21\n  }\n  namespace R2 {\n    class K_n22\n    class K_n23\n    class K_n24["Store store"]\n  }\n  K_n0 *-- K_n1\n  K_n1 -- K_n2\n  K_n0 *-- K_n3 : writes\n  K_n1 -- K_n4 : reads\n  K_n3 "1" ..> "*" K_n5 : calls\n  K_n1 "1" --> "*" K_n6\n  K_n0 -- K_s1\n  K_n5 ..> K_n11\n  K_n7 -- K_n12 : calls\n  K_n7 --> K_n13\n  K_n0 o-- K_n14 : reads\n  K_n0 --> K_n15\n  K_s1 "1" <|-- "*" K_n16\n  K_n1 -- K_n17\n  K_n3 ..> K_n18\n  K_n13 "1" o-- "*" K_n20 : writes\n  K_n18 *-- K_n21\n  K_n0 "1" <|-- "*" K_n22\n  K_n13 *-- K_n24 : calls\n  K_n22 <|-- K_n25 : calls\n  K_n16 <|-- K_n26\n  K_n21 -- K_n27 : emits\n  K_n1 --> K_n29\n  K_n27 --> K_n22\n  K_n19 o-- K_n18\n  K_n3 ..|> K_n2\n  K_n26 <|-- K_n3\n  K_n18 ..> K_n4 : emits\n  K_n9 ..|> K_n3\n  K_n25 <|-- K_n1\n  K_n4 ..|> K_n26\n  K_n14 o-- K_n20\n  K_n26 -- K_n9\n  K_n10 *-- K_n22\n  K_n26 -- K_n15 : writes\n  K_n26 --> K_n13\n  K_n0 --> K_n1',
  },
  {
    name: "random-flowchart-128",
    title: "folded regions come back in their details",
    preset: "low-density",
    source:
      'flowchart TD\n  g3["Order (+2)"]\n  n1["n1"]\n  n2["n2"]\n  n3["Ledger api"]\n  n4["Mail store"]\n  n5["Worker api"]\n  n6["Mail service"]\n  n7["Store store"]\n  n8("Order")\n  n9("Report")\n  g2["Audit job"]\n  n11["Search"]\n  n12["Worker service"]\n  n13["Search job"]\n  n14["Worker"]\n  n15[("n15")]\n  n16["Dup label"]\n  n17["Billing job"]\n  n18("Queue service")\n  n19["Queue"]\n  n20["Index job"]\n  n21["Gateway job"]\n  n22("Dup label")\n  n23["Ledger store"]\n  n24{"Billing db"}\n  n25("Billing job")\n  n26[("Index (+2)")]\n  n27["Worker"]\n  n28["Report store"]\n  s1["Gateway"]\n  n30["Mail store"]\n  n31["Billing service"]\n  g3 --o n1\n  n1 --o n2\n  n2 -->|reads| n3\n  n1 --> n4\n  g3 -.-> n5\n  g3 --o n6\n  n6 -->|calls| n8\n  n3 <-->|reads| n9\n  n9 -.-> g2\n  n2 <--> n11\n  n8 --x|has| n12\n  n8 ==> n13\n  n13 -->|has| n14\n  n12 <-->|emits| n15\n  n5 --o n16\n  n6 --> n17\n  n4 -->|emits| n18\n  n18 --- n19\n  n7 -.->|has| n20\n  n11 ==> n22\n  n12 -.->|writes| n23\n  n12 -->|writes| n24\n  n21 ==> n25\n  n4 --x|reads| n26\n  n20 --x n27\n  n14 --x n28\n  n6 ---|has| s1\n  n27 -->|emits| n31\n  n23 -.->|emits| s1\n  n15 --- n25\n  n6 --o n31\n  g3 --o n1',
  },
  {
    name: "random-state-45",
    title: "a random state diagram comes back whole",
    preset: "low-density",
    source:
      'stateDiagram-v2\n  state "Queue" as S_n0\n  state "Worker job" as S_n1\n  state "Gateway db" as S_n2\n  state "Order api" as S_n3\n  state "n4" as S_n4\n  state "Audit (Gateway)" as S_g2\n  state "Dup label" as S_n6\n  state "Dup label" as S_n7\n  state "Payment" as S_n8\n  state "Worker store" as S_n9\n  state "n10" as S_n10\n  state CR0 {\n    state "n11" as S_n11\n    state "Worker api" as S_n12\n    state "Order job" as S_n13\n    state "Order service" as S_n14\n    [*] --> S_n11\n  }\n  [*] --> S_n0\n  S_n0 --> S_n1\n  S_n0 --> S_n2 : reads\n  S_n1 --> S_n3 : emits\n  S_n0 --> S_n4\n  S_n1 --> S_g2 : writes\n  S_n3 --> S_n6\n  S_n2 --> S_n7 : calls\n  S_n4 --> S_n9\n  S_n6 --> S_n10\n  S_n4 --> S_n11 : reads\n  S_n2 --> S_n12 : calls\n  S_g2 --> S_n14\n  S_n8 --> S_n14\n  S_n9 --> S_n4\n  S_n0 --> S_n1\n  S_n14 --> [*]\n  S_n4 --> CR0',
  },
  {
    name: "claims-flow",
    title: "the flowchart claims come back whole",
    preset: "low-density",
    source:
      'flowchart LR\n  subgraph R1["Region one"]\n    a["Hello <b>World</b> tail"]\n    b["line1<br>line2<br>line3"]\n    c["`**bold** text`"]\n    d["Delta"]\n  end\n  subgraph R2["Region two"]\n    e["Echo"]\n    f["Fox"]\n    g2x["Golf"]\n  end\n  h["Hotel"] -->|"a < b"| a\n  a --> b\n  b --> c\n  c --> d\n  d -->|"x <i>y</i>"| e\n  e --> f\n  f --> g2x\n  h --> i["India"]\n  i --> j["Juliet"]\n  j --> k["Kilo"]\n  k --> l["Lima"]\n  l --> m["Mike"]',
  },
  {
    name: "claims-flow2",
    title: "the second flowchart claims come back whole",
    preset: "low-density",
    source:
      'flowchart LR\n  subgraph R1["Region one"]\n    a["Hello <b>World</b> tail"]\n    b["Bravo"]\n    c["`**bold** text`"]\n    d["Delta"]\n  end\n  subgraph R2["Region two"]\n    e["Echo"]\n    f["Fox"]\n    g2x["Golf"]\n  end\n  h["Hotel"] -->|"a < b"| a\n  a --> b\n  b --> c\n  c --> d\n  d -->|"x <i>y</i>"| e\n  e --> f\n  f --> g2x\n  h --> i["India"]\n  i --> j["Juliet"]\n  j --> k["Kilo"]\n  k --> l["Lima"]\n  l --> m["Mike"]',
  },
  {
    name: "claims-state2",
    title: "the second state claims come back whole",
    preset: "low-density",
    source:
      "stateDiagram-v2\n  [*] --> A\n  A --> Comp\n  state Comp {\n    [*] --> X1\n    X1 --> X2\n    X2 --> X3\n    X3 --> X4\n    X4 --> X5\n    X5 --> X6\n    X6 --> X7\n    X7 --> X8\n    X8 --> [*] : finished\n  }\n  state Other {\n    [*] --> Y1\n    Y1 --> Y2\n    Y2 --> Y3\n    Y3 --> Y4\n    Y4 --> [*]\n  }\n  Comp --> Other\n  Other --> B\n  B --> [*]",
  },
  {
    name: "random-state-121",
    title: "an edge written twice keeps the overview's edges in order",
    preset: "medium-density",
    source:
      'stateDiagram-v2\n  state "Cache api" as S_n0\n  state "Store" as S_n10\n  state "Audit service" as S_n11\n  state CR0 {\n    state "n1" as S_n1\n    state "Dup label" as S_n2\n    state "Gateway store" as S_n3\n    state "Search job" as S_s2\n    state "n5" as S_n5\n    state "Dup label" as S_n9\n    [*] --> S_n1\n    state CR1 {\n      state "Worker job" as S_n6\n      state "Order service" as S_n7\n      state "Payment api" as S_n8\n      [*] --> S_n6\n    }\n  }\n  state CR2 {\n    state "Worker api" as S_n12\n    state "Audit" as S_n13\n    state "n14" as S_n14\n    [*] --> S_n12\n  }\n  [*] --> S_n0\n  S_n0 --> S_n1 : has\n  S_n0 --> S_n2 : calls\n  S_n1 --> S_n3\n  S_n2 --> S_s2\n  S_n1 --> S_n5 : emits\n  S_s2 --> S_n6\n  S_n3 --> S_n7\n  S_n7 --> S_n8\n  S_n1 --> S_n10\n  S_n10 --> S_n11 : emits\n  S_n11 --> S_n12 : emits\n  S_n6 --> S_n13 : writes\n  S_n11 --> S_n14\n  S_s2 --> S_n0\n  S_n0 --> S_n1 : has\n  S_n8 --> CR0\n',
  },
  {
    name: "random-flowchart-4",
    title: "a stub for a group whose label carries its id names that group",
    preset: "high-density",
    source:
      'flowchart TD\n  n0["Billing store"]\n  n1["Auth job"]\n  n2["Ledger job"]\n  n3["Dup label"]\n  n4{"n4"}\n  n5{"Store"}\n  n6["Dup label"]\n  n7["Report"]\n  n8["Auth job"]\n  n9("Auth")\n  n10["Cache"]\n  n11["Mail"]\n  n12["Payment service"]\n  n13["Dup label"]\n  n14["Billing (+2)"]\n  n15["Audit (+2)"]\n  n16{"Billing api"}\n  n17["Billing"]\n  n18["n18"]\n  n19["Billing store"]\n  n20["Mail job"]\n  n21["Report (+2)"]\n  n22["Cache db"]\n  n23["Gateway"]\n  n24["Order job"]\n  n25["Audit store"]\n  n26["Dup label"]\n  n27["Order"]\n  g1["Index api"]\n  n29["Gateway db"]\n  n30["Mail api"]\n  n31["Store (+2)"]\n  n32["Dup label"]\n  n33{"Auth api"}\n  n34["Cache"]\n  n35[("Audit job")]\n  n36["Audit api"]\n  n37["Index store"]\n  n38["Gateway api"]\n  n39["Report job"]\n  n40{"Store (Audit)"}\n  n41["Cache api"]\n  n42["Gateway api"]\n  n43{"Audit api"}\n  n44["Ledger job"]\n  n45["n45"]\n  n46["Audit service"]\n  n47{"Cache (+2)"}\n  n48["n48"]\n  n49[("Report api")]\n  n50["Cache job"]\n  n51["Order service"]\n  n0 -->|reads| n1\n  n0 --> n2\n  n2 --> n3\n  n3 --- n4\n  n6 --> n7\n  n6 --x n8\n  n8 --x n10\n  n9 --> n12\n  n11 --o n13\n  n10 --o|writes| n14\n  n10 <--> n15\n  n3 --> n16\n  n9 -.-> n17\n  n6 --o n18\n  n16 ---|calls| n19\n  n8 -.-> n21\n  n20 --> n22\n  n11 <--> n23\n  n17 --> n25\n  n21 --o|has| n26\n  n0 <--> n27\n  n19 --> g1\n  n13 ==> n29\n  n8 --> n30\n  n15 -.-> n31\n  n25 --o n32\n  n24 <--> n34\n  n34 --x|writes| n35\n  n2 --x n36\n  n29 -.-> n39\n  n30 <-->|has| n40\n  n14 ==> n41\n  n14 -->|calls| n42\n  n36 <--> n43\n  n20 -.-> n44\n  n46 ==>|emits| n47\n  n24 --> n48\n  n42 --> n49\n  n48 --> n50\n  n24 ==> n51\n',
  },
];

describe("a plan reads back whole, or there is none", () => {
  for (const c of CASES) {
    test(
      c.title,
      async () => {
        const out = await splitOutcome(c.source, configFromPreset(c.preset));
        expect(out.violations).toEqual([]);
        if (!out.plan) {
          expect(out.reason).not.toBe("");
          return;
        }
        expect(await faithful(c.source, out.plan)).toEqual([]);
      },
      SLOW,
    );
  }
});

describe("concurrency regions", () => {
  test("a composite holding concurrency regions is not split", async () => {
    const out = await splitOutcome(
      "stateDiagram-v2\n  [*] --> Active\n  state Active {\n    [*] --> NumOff\n    NumOff --> NumOn\n    NumOn --> NumOff\n    --\n    [*] --> CapsOff\n    CapsOff --> CapsOn\n    CapsOn --> CapsOff\n  }\n  Active --> X0\n  Active --> X1\n  Active --> X2\n  Active --> X3\n  Active --> X4\n  Active --> X5\n  Active --> X6\n  Active --> X7\n  Active --> X8\n  Active --> X9",
      configFromPreset("low-density"),
    );
    expect(out.plan).toBeNull();
    expect(out.reason).toBe("concurrent state regions are not split");
  });
});
