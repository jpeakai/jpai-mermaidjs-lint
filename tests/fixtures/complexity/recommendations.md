# Complexity failures and recommended fixes

<!-- expect: complexity-node-count-acceptable-exceeded complexity-node-count-cognitive-limit complexity-node-count-hard-limit complexity-subgraph-nesting-too-deep complexity-visual-score-acceptable-exceeded complexity-visual-score-critical contrast-directive-unauditable parse-diagram-unparseable -->

This is the companion to `bands.md`.
Each section pairs a failing diagram with what the linter reports, a recommended remedy, and a passing diagram.
The examples use realistic system content, so each failure looks like one from a real project.
Check the file with the default `high-density` preset:

```bash
bunx @jpeakai/mermaidjs-lint tests/fixtures/complexity/recommendations.md
```

From a clone of this repo, `bun run src/bin.ts tests/fixtures/complexity/recommendations.md` does the same.

Every failing diagram reports findings, and every finding fails the run.
The passing diagrams report nothing, with one deliberate exception.
The overview in section 8 reports `contrast-directive-unauditable`, because its `compound` class sets `fill:` with no `color:`.
If any other passing diagram starts to report a finding, the recipe has drifted and this file needs updating.

## Recipe card

| Rule | First fix to try |
|---------|----------------|
| `complexity-node-count-acceptable-exceeded` | Group related nodes into a `subgraph`, or collapse a cluster of leaves into one node. |
| `complexity-node-count-cognitive-limit` | Split into an overview of about 12 nodes plus one detail diagram per subsystem. |
| `complexity-node-count-hard-limit` | Stop drawing. This is a dump, not a diagram. Pick a lens and a level of abstraction, then start again. |
| `complexity-visual-score-acceptable-exceeded` | Delete redundant edges. Introduce a mediating node, such as an API gateway, event bus or service mesh. |
| `complexity-visual-score-critical` | Split by lens (architecture, data flow, sequence), not just by component. Keep the nodes, and draw a different edge set per diagram. |
| `complexity-subgraph-nesting-too-deep` | Flatten to two levels. Move the innermost subgraph to its own diagram, or fold its name into the parent's label. |
| `parse-diagram-unparseable` | Fix the syntax error. `bands.md` holds a working diagram of each kind to compare against. |

The finding's own remediation also names the existing subgraphs to split along, when the diagram has any.

> **Another fix** for the two higher node count rules suits a system with several loosely coupled subsystems.
> Draw an overview whose nodes each point to one sub-diagram.
> See [section 8](#8-hierarchical-decomposition-with-sub-diagram-pointers) below.

## Pick the right diagram kind first

Many complexity findings come from using a `flowchart` for content that is not a flow.
Before drawing, ask what the diagram is for:

| Intent | Right diagram kind |
|--------|-------------------|
| Static component structure, service boundaries, module layout | `flowchart` or `architecture-beta` |
| Interaction over time between a few actors | `sequenceDiagram` |
| Data model entities and their relationships | `erDiagram` |
| Finite states and transitions | `stateDiagram-v2` |
| Concepts branching out from a root | `mindmap` |

The linter parses every kind above, and `bands.md` holds a clean example of each.
Picking the wrong kind still parses, so it shows up as a complexity finding instead.
A data model drawn as a `flowchart`, with an edge for every foreign key, inflates the score quickly.

---

## 1. Acceptable node count exceeded: a flat microservices catalogue

### Failing example

Every microservice is drawn beside the store it owns.
That is 18 services and 18 stores, so 36 nodes.
The services are real, but the flat layout hides which are platform pieces, domain services or third party integrations.

```mermaid
flowchart LR
  auth[auth-service] --> auth_db[(users_auth)]
  sso[sso-gateway] --> sso_db[(sso_sessions)]
  billing[billing-service] --> billing_db[(billing_ledger)]
  invoicing[invoicing-service] --> invoice_db[(invoices)]
  subscriptions[subscriptions-service] --> subs_db[(subscriptions)]
  catalog[catalog-service] --> catalog_db[(products)]
  search[search-service] --> search_idx[(elasticsearch)]
  recommendations[recs-service] --> recs_cache[(redis_recs)]
  reviews[reviews-service] --> reviews_db[(reviews)]
  orders[orders-service] --> orders_db[(orders)]
  cart[cart-service] --> cart_cache[(redis_carts)]
  checkout[checkout-service] --> checkout_q[[sqs_checkouts]]
  inventory[inventory-service] --> inventory_db[(inventory)]
  warehouse[warehouse-service] --> warehouse_db[(fulfillment)]
  shipping[shipping-service] --> shipping_db[(shipments)]
  notifications[notifications-service] --> notif_q[[sns_notifications]]
  email[email-service] --> sendgrid[/Sendgrid API/]
  sms[sms-service] --> twilio[/Twilio API/]
```

### What the linter reports

```text
complexity-node-count-acceptable-exceeded 36 nodes > 35 acceptable threshold
```

The 18 edges bring the score to 45, under `vcsAcceptable`, so no score rule fires.

### Recommendation

A list of 18 services and their stores is a catalogue, not an architecture diagram.
A reader cannot see structure at this density.
Two fixes work well:

1. **Group by business domain**.
   Most services fall into three to five domains, such as Identity, Commerce, Content, Fulfillment and Communications.
   Wrap each domain in a `subgraph`.
2. **Drop the store when it is implied**.
   Each service owning its own database is the microservices norm, so 18 copies of it say nothing.
   Draw a store only when services share it, or when its type is itself a design point.

### Passing example

```mermaid
flowchart LR
  subgraph Identity
    auth[auth-service]
    sso[sso-gateway]
  end
  subgraph Commerce
    billing[billing-service]
    subscriptions[subscriptions-service]
    cart[cart-service]
    checkout[checkout-service]
    orders[orders-service]
  end
  subgraph Content
    catalog[catalog-service]
    search[search-service]
    recs[recs-service]
    reviews[reviews-service]
  end
  subgraph Fulfillment
    inventory[inventory-service]
    warehouse[warehouse-service]
    shipping[shipping-service]
  end
  subgraph Communications
    notifications[notifications-service]
    email[email-service]
    sms[sms-service]
  end
  ops_store[(shared operational store)]
  Commerce --> ops_store
  Fulfillment --> ops_store
  Identity --> ops_store
```

---

## 2. Cognitive limit exceeded: per-source pipeline stages

### Failing example

An ELT pipeline that forgot to abstract gives every SaaS source its own landing table, normaliser, enricher and publish target.
Ten sources in five stages plus one orchestrator make 51 nodes.

```mermaid
flowchart LR
  %% Sources (10)
  stripe[Stripe] --> raw_stripe[(raw.stripe)]
  segment[Segment] --> raw_segment[(raw.segment)]
  hubspot[HubSpot] --> raw_hubspot[(raw.hubspot)]
  salesforce[Salesforce] --> raw_salesforce[(raw.salesforce)]
  mixpanel[Mixpanel] --> raw_mixpanel[(raw.mixpanel)]
  amplitude[Amplitude] --> raw_amplitude[(raw.amplitude)]
  intercom[Intercom] --> raw_intercom[(raw.intercom)]
  zendesk[Zendesk] --> raw_zendesk[(raw.zendesk)]
  pagerduty[PagerDuty] --> raw_pagerduty[(raw.pagerduty)]
  github[GitHub] --> raw_github[(raw.github)]
  %% Normalize per-source (10)
  raw_stripe --> norm_stripe[norm_stripe]
  raw_segment --> norm_segment[norm_segment]
  raw_hubspot --> norm_hubspot[norm_hubspot]
  raw_salesforce --> norm_salesforce[norm_salesforce]
  raw_mixpanel --> norm_mixpanel[norm_mixpanel]
  raw_amplitude --> norm_amplitude[norm_amplitude]
  raw_intercom --> norm_intercom[norm_intercom]
  raw_zendesk --> norm_zendesk[norm_zendesk]
  raw_pagerduty --> norm_pagerduty[norm_pagerduty]
  raw_github --> norm_github[norm_github]
  %% Enrich per-source (10)
  norm_stripe --> enrich_revenue[enrich_revenue]
  norm_segment --> enrich_events[enrich_events]
  norm_hubspot --> enrich_company[enrich_company]
  norm_salesforce --> enrich_deals[enrich_deals]
  norm_mixpanel --> enrich_sessions[enrich_sessions]
  norm_amplitude --> enrich_funnels[enrich_funnels]
  norm_intercom --> enrich_conversations[enrich_convos]
  norm_zendesk --> enrich_tickets[enrich_tickets]
  norm_pagerduty --> enrich_incidents[enrich_incidents]
  norm_github --> enrich_commits[enrich_commits]
  %% Publish per-destination (10)
  enrich_revenue --> snowflake[(Snowflake)]
  enrich_events --> bigquery[(BigQuery)]
  enrich_company --> dbt_marts[(dbt marts)]
  enrich_deals --> looker[Looker]
  enrich_sessions --> tableau[Tableau]
  enrich_funnels --> hex[Hex]
  enrich_conversations --> retool[Retool]
  enrich_tickets --> sigma[Sigma]
  enrich_incidents --> metabase[Metabase]
  enrich_commits --> grafana[Grafana]
  %% Orchestrator (1)
  airflow[Airflow DAG]
```

### What the linter reports

```text
complexity-node-count-cognitive-limit 51 nodes > 50 (Huang 2020 cognitive limit)
complexity-visual-score-acceptable-exceeded VCS 71.0 > 60 acceptable threshold
```

Two rules fire because node count and score are separate measures, each with its own ladder.
The 51 nodes and 40 edges cross the node limit and the score threshold at once.

### Recommendation

Huang and colleagues (2020) found that a node-link diagram gets hard to read at around 50 nodes.
Past that point, readers stop tracing paths and start matching patterns.
For pipeline diagrams the fix is nearly always the same: collapse the fan-out.
If a stage does the same thing to every source, draw that stage as one box.

Use two levels of detail:

1. Keep the 51-node pipeline in a detail section, inside a collapsed `<details>` block for engineers who need it.
2. Write a new overview of about 12 nodes that collapses each per-source stage into one stage.
   Place it above the `<details>` block.

### Passing example

```mermaid
flowchart LR
  sources[10 SaaS sources<br/>Stripe · Segment · HubSpot · ...] --> raw[raw landing<br/>raw.* schemas]
  raw --> normalize[normalize<br/>per-source cleaners]
  normalize --> enrich[enrich<br/>revenue · events · tickets]
  enrich --> warehouse[(Snowflake / BigQuery)]
  warehouse --> bi[BI surfaces<br/>Looker · Tableau · Hex · ...]
  airflow[Airflow DAG] -.->|orchestrates| sources
  airflow -.->|orchestrates| normalize
  airflow -.->|orchestrates| enrich
```

---

## 3. Hard limit exceeded: a full AWS footprint dump

### Failing example

An inventory of a mid-sized team's production AWS account, across tiers and availability zones, makes 101 nodes.
Mermaid renders it, but the image cannot be read at any screen size.

```mermaid
flowchart TD
  %% VPC / networking (10)
  vpc_prod[vpc-prod] --> sub_1a[subnet-1a] & sub_1b[subnet-1b] & sub_1c[subnet-1c] & sub_2a[subnet-2a] & sub_2b[subnet-2b] & sub_2c[subnet-2c]
  vpc_prod --> igw[igw-prod] & natgw[natgw-prod] & tgw[tgw-prod]
  %% ALBs (4)
  alb_web[alb-web] & alb_api[alb-api] & alb_admin[alb-admin] & nlb_tcp[nlb-tcp]
  %% EC2 web tier (20)
  web_001[ec2-web-001] & web_002[ec2-web-002] & web_003[ec2-web-003] & web_004[ec2-web-004] & web_005[ec2-web-005] & web_006[ec2-web-006] & web_007[ec2-web-007] & web_008[ec2-web-008] & web_009[ec2-web-009] & web_010[ec2-web-010]
  web_011[ec2-web-011] & web_012[ec2-web-012] & web_013[ec2-web-013] & web_014[ec2-web-014] & web_015[ec2-web-015] & web_016[ec2-web-016] & web_017[ec2-web-017] & web_018[ec2-web-018] & web_019[ec2-web-019] & web_020[ec2-web-020]
  %% EC2 app tier (25)
  app_001[ec2-app-001] & app_002[ec2-app-002] & app_003[ec2-app-003] & app_004[ec2-app-004] & app_005[ec2-app-005] & app_006[ec2-app-006] & app_007[ec2-app-007] & app_008[ec2-app-008] & app_009[ec2-app-009] & app_010[ec2-app-010]
  app_011[ec2-app-011] & app_012[ec2-app-012] & app_013[ec2-app-013] & app_014[ec2-app-014] & app_015[ec2-app-015] & app_016[ec2-app-016] & app_017[ec2-app-017] & app_018[ec2-app-018] & app_019[ec2-app-019] & app_020[ec2-app-020]
  app_021[ec2-app-021] & app_022[ec2-app-022] & app_023[ec2-app-023] & app_024[ec2-app-024] & app_025[ec2-app-025]
  %% EC2 worker tier (15)
  w_001[ec2-worker-001] & w_002[ec2-worker-002] & w_003[ec2-worker-003] & w_004[ec2-worker-004] & w_005[ec2-worker-005] & w_006[ec2-worker-006] & w_007[ec2-worker-007] & w_008[ec2-worker-008]
  w_009[ec2-worker-009] & w_010[ec2-worker-010] & w_011[ec2-worker-011] & w_012[ec2-worker-012] & w_013[ec2-worker-013] & w_014[ec2-worker-014] & w_015[ec2-worker-015]
  %% RDS (6)
  rds_prod[(rds-prod)] & rds_analytics[(rds-analytics)] & rds_audit[(rds-audit)] & rds_reports[(rds-reports)] & rds_legacy[(rds-legacy)] & rds_replica[(rds-replica)]
  %% ElastiCache (4)
  redis_sessions[(redis-sessions)] & redis_cache[(redis-cache)] & redis_ratelimit[(redis-ratelimit)] & redis_queue[(redis-queue)]
  %% Kinesis / SQS (5)
  kinesis_events[[kinesis-events]] & kinesis_audit[[kinesis-audit]] & sqs_jobs[[sqs-jobs]] & sqs_dlq[[sqs-dlq]] & eventbridge[[eventbridge-bus]]
  %% Lambdas (8)
  lambda_ingest[λ lambda-ingest] & lambda_etl[λ lambda-etl] & lambda_email[λ lambda-email] & lambda_webhook[λ lambda-webhook] & lambda_cron[λ lambda-cron] & lambda_resize[λ lambda-resize] & lambda_expire[λ lambda-expire] & lambda_fanout[λ lambda-fanout]
  %% S3 (4)
  s3_assets[(s3-assets)] & s3_backup[(s3-backup)] & s3_logs[(s3-logs)] & s3_data_lake[(s3-data-lake)]
```

### What the linter reports

```text
complexity-node-count-hard-limit 101 nodes > 100 hard limit
complexity-visual-score-critical VCS 105.5 > 100 critical threshold
```

### Recommendation

Past the hard limit, no fix keeps the diagram.
The scope is wrong: it shows a whole account's resources at one level of abstraction.
That is an inventory, not architecture.

1. **Pick a lens**.
   Is it about request flow, deployment topology, cost or blast radius?
   The lens narrows what to draw.
2. **Pick a level**.
   Draw either an overview of about 12 actors, tiers or systems, or the detail of one subsystem in at most 35 nodes.
   Do not mix the two.
3. **Start again from an empty canvas** at the chosen lens and level.
   Trimming a 101-node inventory to 35 tends to keep the wrong things.

For the inventory itself, use a table or a resource tagging report, not a diagram.

### Passing example

The deployment lens at overview level shows what flows through the stack, and leaves out single instances:

```mermaid
flowchart LR
  user([user]) --> cdn[CloudFront / CDN]
  cdn --> alb[ALB]
  alb --> web[web tier<br/>20× ec2]
  web --> app[app tier<br/>25× ec2]
  app --> data[data tier<br/>RDS + Redis]
  app --> events[[event bus<br/>Kinesis + SQS]]
  events --> workers[worker tier<br/>15× ec2 + λ fleet]
  workers --> data
```

---

## 4. Acceptable score exceeded: a microservice mesh with no gateway

### Failing example

Fifteen microservices each call every other one directly, which is the classic mesh without a service mesh.
That is 105 edges.
The 15 nodes stay under every node threshold, but the edges make the diagram unreadable.

```mermaid
flowchart LR
  auth --> users & billing & orders & inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications
  users --> billing & orders & inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications
  billing --> orders & inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications
  orders --> inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications
  inventory --> shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications
  shipping --> email & sms & support & audit & analytics & recs & reviews & catalog & notifications
  email --> sms & support & audit & analytics & recs & reviews & catalog & notifications
  sms --> support & audit & analytics & recs & reviews & catalog & notifications
  support --> audit & analytics & recs & reviews & catalog & notifications
  audit --> analytics & recs & reviews & catalog & notifications
  analytics --> recs & reviews & catalog & notifications
  recs --> reviews & catalog & notifications
  reviews --> catalog & notifications
  catalog --> notifications
```

### What the linter reports

```text
complexity-visual-score-acceptable-exceeded VCS 67.5 > 60 acceptable threshold
```

### Recommendation

When every service touches every other one, the diagram is an adjacency matrix drawn with arrows.
The diagram fix mirrors the architecture fix:

1. **Introduce a mediating node**.
   Services should not call each other directly either.
   An API gateway or a service mesh such as Istio, Linkerd or Consul turns the full mesh into two fans.
2. **Bundle parallel edges**.
   If direct peer calls really are the topology, the ELK layout's `mergeEdges` option draws parallel edges as one stroke.
3. **Use an event bus**.
   If the calls are asynchronous, show services publishing to and subscribing from a stream instead.

### Passing example

The same 15 services behind a gateway and a mesh make 18 nodes and 17 edges:

```mermaid
---
config:
  layout: elk
  elk: { mergeEdges: true }
---
flowchart LR
  client([client]) --> gateway[API gateway]
  gateway --> mesh{{service mesh<br/>istio}}
  mesh --> auth & users & billing & orders & inventory
  mesh --> shipping & email & sms & support & notifications
  mesh --> audit & analytics & recs & reviews & catalog
```

---

## 5. Critical score exceeded: a full-mesh monolith in progress

### Failing example

Twenty services are all coupled to each other.
This is a monolith being broken apart, where every extracted service still depends on every other one.
The 190 edges push the score past the critical threshold, though the 20 nodes are fine.

```mermaid
flowchart LR
  auth --> users & billing & orders & inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  users --> billing & orders & inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  billing --> orders & inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  orders --> inventory & shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  inventory --> shipping & email & sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  shipping --> email & sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  email --> sms & support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  sms --> support & audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  support --> audit & analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  audit --> analytics & recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  analytics --> recs & reviews & catalog & notifications & search & cart & checkout & payments & tax
  recs --> reviews & catalog & notifications & search & cart & checkout & payments & tax
  reviews --> catalog & notifications & search & cart & checkout & payments & tax
  catalog --> notifications & search & cart & checkout & payments & tax
  notifications --> search & cart & checkout & payments & tax
  search --> cart & checkout & payments & tax
  cart --> checkout & payments & tax
  checkout --> payments & tax
  payments --> tax
```

### What the linter reports

```text
complexity-visual-score-critical VCS 115.0 > 100 critical threshold
```

### Recommendation

A critical score means a reader would give up before finishing.
Split by lens, not by component count.
The same 20 services support three lenses:

- **Architecture:** what the components are, grouped, with parent and child edges only.
- **Sequence:** how one interaction, such as checkout, passes through some of them over time.
- **Data flow:** how one entity, such as an order, moves between stores.

Readers pick the lens that answers their question, and no single diagram tries to show all three.

### Passing example: architecture lens

Six domains hold the 20 services and tell the structural story:

```mermaid
flowchart LR
  subgraph Identity
    auth
    users
  end
  subgraph Commerce
    cart
    checkout
    orders
    billing
    payments
    tax
  end
  subgraph Content
    catalog
    search
    recs
    reviews
  end
  subgraph Fulfillment
    inventory
    shipping
  end
  subgraph Communications
    notifications
    email
    sms
  end
  subgraph Platform
    audit
    analytics
    support
  end
  Identity --> Commerce --> Fulfillment
  Commerce --> Communications
  Platform -.-> Identity & Commerce & Content & Fulfillment
```

### Passing example: sequence lens

For the same system, the checkout interaction as a sequence diagram.
One workflow, read from top to bottom, is far clearer than every interaction on one flowchart:

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Gateway as API gateway
  participant Cart as cart-service
  participant Checkout as checkout-service
  participant Inventory as inventory-service
  participant Payments as payments-service
  participant Orders as orders-service
  participant Notif as notifications-service

  User->>Gateway: POST /checkout
  Gateway->>Cart: GET cart
  Cart-->>Gateway: line items
  Gateway->>Checkout: submit(items)
  Checkout->>Inventory: reserve
  Inventory-->>Checkout: reservation_id
  Checkout->>Payments: charge
  Payments-->>Checkout: payment_id
  Checkout->>Orders: create(order)
  Orders-->>Checkout: order_id
  Checkout->>Notif: order_placed
  Checkout-->>Gateway: 201 order_id
  Gateway-->>User: confirmation page
```

---

## 6. Subgraphs nested too deep: AWS organisation, account and region

### Failing example

A multi-account cloud topology nests three levels: organisation, then account, then region.
Past two levels, inner boundaries gain padding until the diagram is mostly white space.
Readers lose track of which container they are in.

```mermaid
flowchart TB
  subgraph aws_org[AWS Organization — acme.com]
    subgraph acct_prod[prod account — 111122223333]
      subgraph region_use1[us-east-1]
        prod_use1_web[ec2-web] --> prod_use1_rds[(rds-prod-use1)]
      end
    end
    subgraph acct_staging[staging account — 444455556666]
      subgraph region_use1_stg[us-east-1]
        stg_use1_web[ec2-web] --> stg_use1_rds[(rds-staging-use1)]
      end
    end
  end
```

### What the linter reports

```text
complexity-subgraph-nesting-too-deep subgraph nesting depth 3 (at least 3) hinders readability
```

### Recommendation

Two fixes work well:

1. **Fold the inner level into the middle label**.
   A label such as `prod / us-east-1` replaces a nested region subgraph.
   The hierarchy still reads, without the extra box.
2. **Give each leaf its own diagram**.
   When regions differ in architecture, draw each region separately.
   Link them from a parent overview that shows only the organisation and its accounts.

### Passing example: compound labels, two levels deep

```mermaid
flowchart TB
  subgraph aws_org[AWS Organization — acme.com]
    prod_use1[prod / us-east-1]
    prod_usw2[prod / us-west-2]
    staging_use1[staging / us-east-1]
    dev_use1[dev / us-east-1]
  end
  prod_use1 --> ec2_prod_use1[ec2-web-asg] & rds_prod_use1[(rds-prod)]
  prod_usw2 --> ec2_prod_usw2[ec2-web-asg] & rds_prod_usw2[(rds-prod-dr)]
  staging_use1 --> ec2_stg[ec2-web] & rds_stg[(rds-staging)]
  dev_use1 --> ec2_dev[ec2-web] & rds_dev[(rds-dev)]
```

---

## 7. Unparseable diagram: an unknown keyword

### Failing example

Mermaid does not recognise the diagram keyword, so the parser reads zero nodes.

```mermaid
not_a_known_diagram_type
  alpha
  beta
```

### What the linter reports

```text
parse-diagram-unparseable not_a_known_diagram_type yielded 0 nodes from multi-line source (parser: mermaid-core): No diagram type detected matching given configuration for text: not_a_known_diagram_type
```

The complexity rules skip a diagram that fails to parse.
Counts from a failed parse mean nothing, so any threshold check against them would mislead.

### Recommendation

Every diagram kind in `bands.md` parses cleanly, from `flowchart` to `requirementDiagram`.
If your diagram of one of those kinds fails and the fixture does not, the cause is in your syntax, not in the tool.

Common causes:

| Cause | Fix |
|-------|-----|
| A typo in the diagram keyword, such as `flochart` | Spell it correctly |
| A `subgraph` with no matching `end` | Match them up |
| A grammar error, such as a hyphen in a `requirementDiagram` id like `REQ-001` | Follow the grammar, using the matching example in `bands.md` |
| Syntax newer than the mermaid version this tool bundles | Update the tool, or revise the diagram |

### Passing example: a valid flowchart

The same intent as the unknown keyword, written as a valid flowchart:

```mermaid
flowchart LR
  alpha --> beta
```

---

## 8. Hierarchical decomposition with sub-diagram pointers

This is an alternative to the two-level pattern in section 2.
When a system has several loosely coupled subsystems, each worth its own diagram, use an overview of compound nodes.
Each compound node has a dotted border and points to its own sub-diagram section below.
It works like a UML package diagram, drawn in mermaid.

### Failing example

A whole e-commerce platform is drawn as one diagram with every subsystem expanded.
It has 51 nodes and 25 edges, more than a reader can hold in mind.

```mermaid
flowchart LR
  %% Actors (3)
  customer([customer]) & admin([admin]) & support_agent([support])
  %% Identity (5)
  auth[auth] & sso[sso] & users[users] & permissions[permissions] & audit[audit]
  %% Commerce (8)
  cart[cart] & checkout[checkout] & orders[orders] & billing[billing] & payments[payments] & tax[tax] & coupons[coupons] & refunds[refunds]
  %% Content (6)
  catalog[catalog] & search[search] & recs[recs] & reviews[reviews] & ratings[ratings] & cms[cms]
  %% Fulfillment (7)
  inventory[inventory] & warehouse[warehouse] & pickers[pickers] & packers[packers] & shipping[shipping] & tracking[tracking] & returns[returns]
  %% Communications (5)
  notifications[notifications] & email[email] & sms[sms] & push[push] & slack[slack]
  %% Analytics (4)
  events[events] & metrics[metrics] & reporting[reporting] & dashboards[dashboards]
  %% Support (4)
  tickets[tickets] & chat[chat] & knowledge[knowledge] & feedback[feedback]
  %% Platform (4)
  gateway[api gateway] & mesh[service mesh] & ops_db[(ops db)] & cache[(redis)]
  %% External (3)
  stripe[/Stripe/] & sendgrid[/Sendgrid/] & twilio[/Twilio/]
  %% Queue (2)
  queue[[sqs]] & search_idx[(elasticsearch)]
  %% Entry paths
  customer --> gateway --> auth --> users
  customer --> cart --> checkout --> payments --> stripe
  checkout --> orders --> inventory --> warehouse --> shipping --> tracking
  orders --> billing
  checkout --> tax & coupons
  orders --> notifications --> email --> sendgrid
  notifications --> sms --> twilio
  admin --> permissions
  support_agent --> tickets
  search --> search_idx
  events --> metrics --> dashboards
```

### What the linter reports

```text
complexity-node-count-cognitive-limit 51 nodes > 50 (Huang 2020 cognitive limit)
complexity-visual-score-acceptable-exceeded VCS 63.5 > 60 acceptable threshold
```

### Recommendation

When a system splits into four or more subsystems that each make sense alone, do not hide them together in one `<details>` block.
Give each its own diagram, and have the overview point at them.

Three mermaid features make this work:

| Feature | Purpose | Snippet |
|---------|---------|---------|
| `classDef` with `stroke-dasharray` | A dotted border that marks a node as detailed elsewhere | `classDef compound stroke-dasharray:5 5,stroke-width:2px,fill:#f5f5f5` |
| Markdown string labels | An italic "See Sub-Diagram X" line inside the label | `commerce["\`**Commerce**<br/>*See Sub-Diagram 2*\`"]` |
| `click` directive | Where the renderer allows it, makes the node a link to the sub-diagram's heading | `click commerce "#sub-diagram-2--commerce" "Commerce detail"` |

Each sub-diagram sits in its own section and has its own budget of at most 35 nodes and a score of at most 60.
Readers work top down: they see the overview, follow the node they care about, and land on a self-contained diagram.

### Passing overview: compound node pointers

```mermaid
flowchart LR
  customer([customer])
  admin([admin])
  gateway[API gateway]

  customer --> gateway
  admin --> gateway

  gateway --> identity
  gateway --> commerce
  gateway --> content

  commerce --> fulfillment
  commerce --> communications
  commerce -.->|emits| analytics
  fulfillment -.->|emits| analytics

  identity["`**Identity**
  *See Sub-Diagram 1*`"]
  commerce["`**Commerce**
  *See Sub-Diagram 2*`"]
  content["`**Content**
  *See Sub-Diagram 3*`"]
  fulfillment["`**Fulfillment**
  *See Sub-Diagram 4*`"]
  communications["`**Communications**
  *(subsystem — TBD)*`"]
  analytics["`**Analytics**
  *(subsystem — TBD)*`"]

  classDef compound stroke-dasharray:5 5,stroke-width:2px,fill:#f5f5f5
  class identity,commerce,content,fulfillment,communications,analytics compound

  click identity "#sub-diagram-1--identity" "Identity subsystem detail"
  click commerce "#sub-diagram-2--commerce" "Commerce subsystem detail"
  click content "#sub-diagram-3--content" "Content subsystem detail"
  click fulfillment "#sub-diagram-4--fulfillment" "Fulfillment subsystem detail"
```

The overview has nine nodes, well under every threshold.
Dotted borders set the subsystem nodes apart from concrete nodes such as the gateway and the actors.
The `click` directives turn the rendered diagram into a table of contents.

This overview reports `contrast-directive-unauditable`.
The `compound` class sets `fill:` but no `color:`, so the label colour depends on the renderer's theme.
Under the `github` profile the linter cannot score it, and says so rather than pass it unchecked.
Adding a `color:` that reads on the fill clears the finding.

### Sub-Diagram 1 / Identity

```mermaid
flowchart LR
  user([user]) --> gateway[API gateway]
  gateway --> auth[auth-service]
  gateway --> sso[sso-gateway]
  auth --> users[users-service]
  sso --> users
  users --> permissions[permissions-service]
  permissions --> audit[audit-log]
  auth --> session_store[(redis-sessions)]
  users --> users_db[(users_auth)]
```

### Sub-Diagram 2 / Commerce

```mermaid
flowchart LR
  gateway[API gateway] --> cart[cart-service]
  cart --> checkout[checkout-service]
  checkout --> tax[tax-service]
  checkout --> coupons[coupons-service]
  checkout --> payments[payments-service]
  payments --> stripe[/Stripe/]
  checkout --> orders[orders-service]
  orders --> billing[billing-service]
  orders --> refunds[refunds-service]
  cart --> cart_cache[(redis-carts)]
  orders --> orders_db[(orders)]
  billing --> billing_db[(billing_ledger)]
```

### Sub-Diagram 3 / Content

```mermaid
flowchart LR
  user([user]) --> catalog[catalog-service]
  catalog --> catalog_db[(products)]
  user --> search[search-service]
  search --> search_idx[(elasticsearch)]
  user --> recs[recs-service]
  recs --> recs_cache[(redis-recs)]
  catalog --> reviews[reviews-service]
  reviews --> ratings[ratings-service]
  reviews --> reviews_db[(reviews)]
  catalog --> cms[cms-service]
```

### Sub-Diagram 4 / Fulfillment

```mermaid
flowchart LR
  orders[orders-service] --> inventory[inventory-service]
  inventory --> warehouse[warehouse-service]
  warehouse --> pickers[pickers-team]
  pickers --> packers[packers-team]
  packers --> shipping[shipping-service]
  shipping --> tracking[tracking-service]
  tracking --> returns[returns-service]
  inventory --> inventory_db[(inventory)]
  shipping --> shipping_db[(shipments)]
```

### Trade-offs against two levels of detail

| Criterion | Two levels (section 2 fix) | Hierarchical decomposition (section 8 fix) |
|-----------|----------------------|--------------------------------------|
| When to pick | One diagram with one natural overview and detail split | Several loosely coupled subsystems, each worth its own diagram |
| Upkeep | Low: two diagrams in one section | Higher: one section per subsystem, each with its own budget, and anchors to keep in sync |
| Reading | The reader sees all the detail on expanding it | The reader follows links and never sees all the detail at once |
| Fit for a README | Excellent, since the collapsed detail keeps the page short | Better in a dedicated architecture page than on a README landing page |
| How the linter scores it | Each diagram on its own, both within budget | Each sub-diagram on its own, with a deliberately tiny overview |
| Breaks when | The detail passes 35 nodes even after collapsing | A new subsystem is added without its own sub-diagram section |

Use two levels of detail by default.
Reach for hierarchical decomposition when the detail diagram passes 35 nodes, or covers four or more clearly separate subsystems.
Either signal means the diagram has outgrown a single section.
