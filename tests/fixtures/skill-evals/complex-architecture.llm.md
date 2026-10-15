# Storefront platform architecture

<!-- llm: One 46-node diagram was too dense to read, so it became an overview of the eight layers plus five smaller diagrams, one per path through the system, which together keep every node and every connection. -->

This document describes the production topology of the storefront platform.
It covers the edge, the API layer, the domain services, the data stores and the third-party integrations.
It also covers the asynchronous pipeline and the observability stack.
The original diagram was exported from the infrastructure inventory and had grown with every service added.
The linter reported two findings on it: `complexity-node-count-acceptable-exceeded` for 46 nodes, and `complexity-visual-score-critical` for a score of 106.2.
The fix splits it into an overview of the layers and one diagram per path, so each reads on its own and lints clean.

## Overview

```mermaid
flowchart LR
    EDGE[Edge]
    GATEWAY[Gateway]
    WEBL[Web and BFF]
    SVC[Domain services]
    DATA[(Data stores)]
    INTEG[Integrations]
    PIPE[Pipeline]
    OBS[Observability]

    EDGE --> GATEWAY --> WEBL --> SVC
    SVC --> DATA
    SVC --> INTEG
    DATA --> PIPE
    PIPE --> DATA
    SVC -.-> OBS
    WEBL -.-> OBS
```

## Request path

```mermaid
flowchart LR
    subgraph Edge
        DNS[Route 53 DNS]
        CDN[CloudFront CDN]
        WAF[Web application firewall]
    end
    subgraph Gateway
        GW[API gateway]
        AUTH[Auth service]
        RL[Rate limiter]
    end
    subgraph Web
        WEB[Next.js storefront]
        BFF[Backend for frontend]
        ADMIN[Admin console]
    end
    subgraph Services
        CAT[Catalog service]
        SEARCH[Search service]
        REC[Recommendations]
        CART[Cart service]
        CHK[Checkout service]
        USR[Users service]
        REV[Reviews service]
    end

    DNS --> CDN --> WAF --> GW
    GW --> AUTH
    GW --> RL
    GW --> BFF
    GW --> ADMIN
    WEB --> BFF
    BFF --> CAT
    BFF --> SEARCH
    BFF --> REC
    BFF --> CART
    BFF --> CHK
    BFF --> USR
    BFF --> REV
```

## Browse and cart

```mermaid
flowchart LR
    subgraph Services
        CAT[Catalog service]
        SEARCH[Search service]
        REC[Recommendations]
        CART[Cart service]
        PRICE[Pricing service]
        PROMO[Promotions]
        USR[Users service]
        REV[Reviews service]
    end
    subgraph Data
        PG1[(Catalog Postgres)]
        PG3[(Users Postgres)]
        REDIS[(Redis cache)]
        ES[(Elasticsearch)]
        S3[(S3 media bucket)]
        DWH[(Snowflake warehouse)]
    end

    CAT --> PG1
    CAT --> S3
    SEARCH --> ES
    REC --> REDIS
    REC --> DWH
    CART --> REDIS
    CART --> PRICE
    PRICE --> PROMO
    USR --> PG3
    REV --> PG1
```

## Checkout and orders

```mermaid
flowchart LR
    subgraph Services
        CHK[Checkout service]
        CART[Cart service]
        PAY[Payments service]
        TAX[Tax service]
        SHIP[Shipping service]
        ORD[Orders service]
        INV[Inventory service]
    end
    subgraph Data
        PG1[(Catalog Postgres)]
        PG2[(Orders Postgres)]
        KAFKA[[Kafka]]
    end
    subgraph Integrations
        STRIPE[Stripe]
        PAYPAL[PayPal]
        AVALARA[Avalara tax]
        CARRIER[Carrier APIs]
    end

    CHK --> CART
    CHK --> PAY
    CHK --> TAX
    CHK --> SHIP
    CHK --> ORD
    PAY --> STRIPE
    PAY --> PAYPAL
    TAX --> AVALARA
    SHIP --> CARRIER
    ORD --> PG2
    ORD --> INV
    ORD --> KAFKA
    INV --> PG1
```

## Asynchronous pipeline

```mermaid
flowchart LR
    subgraph Data
        KAFKA[[Kafka]]
        DWH[(Snowflake warehouse)]
    end
    subgraph Services
        NOTIF[Notifications]
    end
    subgraph Integrations
        TWILIO[Twilio SMS]
        SENDGRID[SendGrid email]
    end
    subgraph Pipeline
        AIRFLOW[Airflow]
        DBT[dbt models]
        SPARK[Spark jobs]
    end

    KAFKA --> NOTIF
    KAFKA --> SPARK
    NOTIF --> TWILIO
    NOTIF --> SENDGRID
    AIRFLOW --> DBT
    AIRFLOW --> SPARK
    DBT --> DWH
    SPARK --> DWH
```

## Observability

```mermaid
flowchart LR
    subgraph Instrumented
        BFF[Backend for frontend]
        CAT[Catalog service]
        CHK[Checkout service]
        ORD[Orders service]
    end
    subgraph Observability
        PROM[Prometheus]
        GRAF[Grafana]
        JAEGER[Jaeger tracing]
        LOKI[Loki logs]
        PAGER[PagerDuty]
    end

    CAT -.-> PROM
    CHK -.-> PROM
    ORD -.-> PROM
    PROM --> GRAF
    PROM --> PAGER
    BFF -.-> JAEGER
    BFF -.-> LOKI
```

The diagrams are used in onboarding, in architecture reviews, and in incident retrospectives.
Each audience needs a different amount of them.
