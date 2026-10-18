// Shared helpers for the split plan tests: real parser strings in, the working
// graph or the build out, and thresholds narrowed to a target.

import { extractGraph } from "../../src/parse/graph.ts";
import { configFromPreset, type ThresholdConfig } from "../../src/parse/metrics.ts";
import { extractStats } from "../../src/parse/stats.ts";
import type { Build } from "../../src/split/assemble.ts";
import { buildWorkGraph, type WorkGraph } from "../../src/split/graph.ts";
import { directionOf } from "../../src/split/index.ts";
import { planWork } from "../../src/split/plan.ts";
import { EMPTY_PARTITION, type Partition, quotientEdges } from "../../src/split/quotient.ts";
import { type FoldRules, STRICT } from "../../src/split/rules.ts";
import type { TierContext } from "../../src/split/tier.ts";

// The high-density weights with a target of the given node count and score.
export const target = (nodes: number, vcs: number): ThresholdConfig => ({
  ...configFromPreset("high-density"),
  node_target: nodes,
  vcs_target: vcs,
  preset_name: "custom",
});

export const workOf = async (source: string): Promise<WorkGraph> => {
  const [graph, stats, direction] = await Promise.all([
    extractGraph(source),
    extractStats(source),
    directionOf(source),
  ]);
  return buildWorkGraph(graph, { direction, rows: stats.rows });
};

export const ctxOf = (
  work: WorkGraph,
  config: ThresholdConfig,
  part: Partition = EMPTY_PARTITION,
  rules: FoldRules = STRICT,
): TierContext => ({
  work,
  part,
  config,
  qedges: quotientEdges(work, part),
  rules,
});

export const buildOf = async (source: string, config: ThresholdConfig): Promise<Build> => {
  const built = planWork(await workOf(source), config, 1);
  if (typeof built === "string") throw new Error(built);
  return built;
};

export const lines = (...xs: string[]): string => xs.join("\n");

// An order lifecycle: 35 states, 54 transitions, many of them labelled
// branches, and no author regions, so only T5 and T6 can fold it.
export const ORDERS = lines(
  "stateDiagram-v2",
  "  [*] --> Draft",
  "  Draft --> PendingPayment : checkout submitted",
  "  Draft --> Abandoned : cart expired",
  "  Abandoned --> Draft : recovery email clicked",
  "  Abandoned --> [*]",
  "  PendingPayment --> PaymentAuthorised : auth approved",
  "  PendingPayment --> PaymentFailed : auth declined",
  "  PaymentFailed --> PendingPayment : retry with new card",
  "  PaymentFailed --> Cancelled : retries exhausted",
  "  PaymentAuthorised --> FraudReview : risk score high",
  "  FraudReview --> PaymentAuthorised : reviewer clears",
  "  FraudReview --> Cancelled : reviewer rejects",
  "  PaymentAuthorised --> Allocating : risk score low",
  "  Allocating --> Backordered : stock short",
  "  Backordered --> Allocating : stock received",
  "  Backordered --> PartiallyAllocated : split shipment accepted",
  "  Allocating --> Allocated : stock reserved",
  "  PartiallyAllocated --> Allocated : remainder reserved",
  "  Allocated --> Picking : wave released",
  "  Picking --> Packing : picked",
  "  Picking --> Allocating : pick short",
  "  Packing --> AwaitingCollection : label printed",
  "  AwaitingCollection --> InTransit : carrier scan",
  "  InTransit --> OutForDelivery : hub scan",
  "  OutForDelivery --> Delivered : proof of delivery",
  "  OutForDelivery --> DeliveryFailed : nobody home",
  "  DeliveryFailed --> OutForDelivery : redelivery booked",
  "  DeliveryFailed --> ReturnedToSender : attempts exhausted",
  "  InTransit --> Lost : no scan 10 days",
  "  Lost --> Refunded : claim approved",
  "  Delivered --> Captured : settlement",
  "  PaymentAuthorised --> Captured : capture on dispatch",
  "  Delivered --> ReturnRequested : customer requests return",
  "  ReturnRequested --> ReturnInTransit : label issued",
  "  ReturnRequested --> ReturnRejected : outside window",
  "  ReturnInTransit --> ReturnReceived : warehouse scan",
  "  ReturnReceived --> Inspected : QA done",
  "  Inspected --> Refunded : item ok",
  "  Inspected --> PartiallyRefunded : item damaged",
  "  ReturnedToSender --> Refunded",
  "  Cancelled --> Refunded : already captured",
  "  Cancelled --> Voided : authorisation only",
  "  Refunded --> [*]",
  "  PartiallyRefunded --> [*]",
  "  Voided --> [*]",
  "  ReturnRejected --> Completed",
  "  Captured --> Completed : return window closed",
  "  Completed --> Disputed : chargeback opened",
  "  Disputed --> Completed : dispute won",
  "  Disputed --> Refunded : dispute lost",
  "  Completed --> [*]",
  "  PaymentAuthorised --> AddressVerification : address unverified",
  "  AddressVerification --> Allocating : address confirmed",
  "  AddressVerification --> OnHold : customer unreachable",
  "  OnHold --> Allocating : hold released",
  "  OnHold --> Cancelled : hold expired",
  "  Inspected --> ExchangeRequested : customer chose exchange",
  "  ExchangeRequested --> Allocating : replacement order created",
  "  Allocated --> PreOrderWaiting : release date in future",
  "  PreOrderWaiting --> Picking : release date reached",
);
