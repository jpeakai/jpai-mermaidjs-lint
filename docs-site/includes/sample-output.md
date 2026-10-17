```text
docs/architecture.md:6 contrast-text-below-aa classDef warn: text 1.43:1 < 4.5 (#ffffff on #ffd400)
docs/login.md:3-7 parse-diagram-unparseable sequenceDiagram did not parse (parser: mermaid-core) (its line numbers count within the diagram, not the file): Parse error on line 3: Expecting 'TXT', got 'NEWLINE'
docs/pipeline.md:3-41 complexity-node-count-acceptable-exceeded 37 nodes > 35 acceptable threshold
3 finding(s) in 3 file(s)
```

The run exits 1 while any finding remains, so it works as a CI gate.
