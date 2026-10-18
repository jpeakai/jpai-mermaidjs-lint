// The worked example on the Summarising a diagram page. One large diagram is
// planned under every preset by the split code itself, so each overview, each
// detail diagram, each tier and each declared loss on the page is what
// splitOutcome returns, never written by hand (MJL-0025). scripts/build-site.ts
// writes the snippets into docs-site/snippets/summarisation/.

import { configFromPreset, PRESETS, type ThresholdConfig } from "../src/parse/metrics.ts";
import { directionOf, type SplitOutcome, type SplitPlan, splitOutcome } from "../src/split/index.ts";
import {
  caption,
  card,
  cytoscapeElements,
  escapeAttr,
  fence,
  measureStep,
  num,
  type Step,
  stepSnippet,
} from "./complexity-steps.ts";

// A shop architecture with author subgraphs, too large for every preset.
export const DIAGRAM: Step = {
  slug: "architecture",
  alt: "A shop architecture with twenty-nine nodes, thirty-two edges and four subgraphs",
  source: `flowchart TD
  CUST[Customer]
  ADMIN[Administrator]
  CDN[Content cache]
  WAF[Web firewall]
  subgraph web [Web]
    UI[Storefront]
    ADM[Admin console]
    API[API gateway]
  end
  subgraph orders [Orders]
    OS[Order service]
    OQ[Order queue]
    OW[Order worker]
  end
  subgraph billing [Billing]
    PS[Payment service]
    INV[Invoice service]
    REF[Refund service]
  end
  subgraph shipping [Shipping]
    SHS[Shipping service]
    LBL[Label printer]
    TRK[Tracking feed]
  end
  SS[Stock service]
  WH[Warehouse feed]
  RES[Reservation service]
  DB[(Orders DB)]
  PDB[(Payments DB)]
  SDB[(Stock DB)]
  CACHE[(Session cache)]
  MAIL[Email]
  SMS[Text message]
  PUSH[Push alert]
  PSP[Card processor]
  CAR[Carrier]
  LOG[Audit log]
  CUST --> CDN
  CDN --> WAF
  WAF --> UI
  ADMIN --> ADM
  UI --> API
  ADM --> API
  API --> CACHE
  API --> OS
  OS --> OQ
  OQ --> OW
  OW --> PS
  OW --> RES
  OS --> DB
  PS --> PDB
  PS --> PSP
  PS --> INV
  REF --> PS
  ADM --> REF
  INV --> MAIL
  RES --> SS
  SS --> SDB
  WH --> SS
  OW --> SHS
  SHS --> LBL
  SHS --> CAR
  CAR --> TRK
  TRK --> SHS
  SHS --> SMS
  SHS --> PUSH
  OS --> LOG
  PS --> LOG
  REF --> LOG
`,
};

// A loan underwriting flow with no author subgraphs, where nearly every step
// is a decision. Each decision folds with its branches into one decision
// region, so every preset gets a plan.
export const DECISIONS: Step = {
  slug: "decisions",
  alt: "A loan underwriting flowchart with forty-one nodes, eighteen of them decisions, and forty-eight edges",
  source: `flowchart TD
  start(["Application received"]) --> kyc{"Identity verified?"}
  kyc -->|No| kycdoc["Request ID documents"] --> kycwait{"Documents within 14 days?"}
  kycwait -->|No| declinekyc(["Decline: identity"])
  kycwait -->|Yes| kyc
  kyc -->|Yes| sanctions{"Sanctions list hit?"}
  sanctions -->|Yes| compliance["Refer to compliance"] --> compok{"Compliance clears?"}
  compok -->|No| declinesan(["Decline: sanctions"])
  compok -->|Yes| bureau
  sanctions -->|No| bureau["Pull credit bureau file"]
  bureau --> thin{"Thin file?"}
  thin -->|Yes| alt["Score with open banking data"] --> altscore{"Alt score above 620?"}
  altscore -->|No| declinethin(["Decline: insufficient history"])
  altscore -->|Yes| income
  thin -->|No| score{"Bureau score above 680?"}
  score -->|No| score2{"Score above 600?"}
  score2 -->|No| declinescore(["Decline: credit score"])
  score2 -->|Yes| secured{"Offer secured product?"}
  secured -->|Yes| collat["Collateral valuation"] --> ltv{"LTV under 80%?"}
  ltv -->|No| declineltv(["Decline: collateral"])
  ltv -->|Yes| income
  secured -->|No| declinescore
  score -->|Yes| income["Verify income"]
  income --> dti{"Debt-to-income under 40%?"}
  dti -->|No| reduce{"Lower amount fits DTI?"}
  reduce -->|No| declinedti(["Decline: affordability"])
  reduce -->|Yes| counter["Counter-offer lower amount"] --> accept{"Applicant accepts?"}
  accept -->|No| withdrawn(["Withdrawn"])
  accept -->|Yes| fraud
  dti -->|Yes| fraud{"Fraud model flags?"}
  fraud -->|Yes| manual["Manual fraud review"] --> fraudok{"Reviewer clears?"}
  fraudok -->|No| declinefraud(["Decline: fraud"])
  fraudok -->|Yes| pricing
  fraud -->|No| pricing["Risk-based pricing"]
  pricing --> large{"Amount above 50k?"}
  large -->|Yes| senior["Senior underwriter sign-off"] --> signed{"Signed off?"}
  signed -->|No| declinesenior(["Decline: underwriter"])
  signed -->|Yes| offer
  large -->|No| offer["Issue offer"]
  offer --> esign{"E-signed within 30 days?"}
  esign -->|No| expired(["Offer expired"])
  esign -->|Yes| disburse(["Disburse funds"])
`,
};

export interface PlannedPreset {
  name: string;
  config: ThresholdConfig;
  outcome: SplitOutcome;
}

export const planPresets = async (source: string = DIAGRAM.source): Promise<PlannedPreset[]> => {
  const out: PlannedPreset[] = [];
  for (const name of Object.keys(PRESETS)) {
    const config = configFromPreset(name);
    out.push({ name, config, outcome: await splitOutcome(source, config) });
  }
  return out;
};

const targets = (c: ThresholdConfig): string => `${c.node_target} / ${c.vcs_target}`;

const lossByTier = (plan: SplitPlan): string =>
  Object.entries(plan.loss.byTier)
    .map(([tier, n]) => `${tier} ${n}`)
    .join(", ");

// The overview after each tier that changed it, ending at the tier that met
// the target.
export const ladderText = (plan: SplitPlan): string =>
  plan.ladder
    .filter((s, i) => i === 0 || s.nodes !== plan.ladder[i - 1]?.nodes || s.score !== plan.ladder[i - 1]?.score)
    .map((s) => `${s.tier} ${s.nodes} nodes, score ${num(s.score)}`)
    .join("; then ");

// Every emitted source a plan draws, in page order: its overview, then each
// detail, with a detail that is split again followed by its own plan.
export const drawnSources = (plan: SplitPlan): string[] => [
  plan.overviewSource,
  ...plan.details.flatMap((d) => [d.source, ...(d.split ? drawnSources(d.split) : [])]),
];

const groupLabel = (plan: SplitPlan, id: string): string => plan.groups.find((g) => g.id === id)?.label ?? id;

const overviewCards = async (plan: SplitPlan, alt: string): Promise<string[]> => {
  const direction = /^(TD|TB|BT)$/.test(await directionOf(plan.overviewSource)) ? "TB" : "LR";
  const g = plan.overview;
  const counts = `${g.nodes.length} nodes, ${g.edges.length} edges, ${g.subgraphs.length} subgraphs`;
  const data = escapeAttr(JSON.stringify(cytoscapeElements(g)));
  return [
    '<div class="grid ml-compare" markdown>',
    "",
    ...card([caption("Overview source"), "", fence(plan.overviewSource, "text")]),
    "",
    ...card([caption("The overview as drawn"), "", fence(plan.overviewSource, "mermaid")]),
    "",
    "</div>",
    "",
    '<div class="grid ml-compare" markdown>',
    "",
    ...card([
      caption(`What the parser returned for the overview: ${counts}`),
      "",
      `<div class="ml-cy ml-cy--wide" role="img" aria-label="${escapeAttr(alt)}" data-direction="${direction}" data-graph="${data}"></div>`,
    ]),
    "",
    "</div>",
  ];
};

const detailCards = (plan: SplitPlan, config: ThresholdConfig): string[] =>
  plan.details.flatMap((d) => {
    const head = `Detail of ${groupLabel(plan, d.group)}: ${d.nodes} nodes, score ${num(d.score)}`;
    const drawn = card([caption(head), "", fence(d.source, "mermaid")]);
    if (!d.split) return [...drawn, ""];
    const again = card([
      caption("This detail is still over the target, so it is split again. Its overview as drawn:"),
      "",
      fence(d.split.overviewSource, "mermaid"),
    ]);
    const nested = [...again, "", ...planLines(d.split, config)];
    return [...drawn, "", "</div>", "", ...nested, "", '<div class="grid" markdown>', ""];
  });

const summary = (plan: SplitPlan, config: ThresholdConfig): string =>
  fence(
    [
      `target:        ${config.node_target} nodes, score ${config.vcs_target}`,
      `tier:          ${plan.tier}`,
      `overview:      ${plan.overviewNodes} nodes, score ${num(plan.overviewScore)}`,
      `groups:        ${plan.groups.map((g) => `${g.label} [${g.tier}, ${g.reason}]`).join("; ")}`,
      `declared loss: ${plan.loss.newReachablePairs} new reachable pairs (after each tier: ${lossByTier(plan)})`,
      `rows dropped:  ${plan.loss.droppedRows}`,
      `ladder:        ${ladderText(plan)}`,
    ].join("\n"),
    "text",
  );

// A plan's summary and its details, without the overview, which the caller draws.
const planLines = (plan: SplitPlan, config: ThresholdConfig): string[] => [
  summary(plan, config),
  "",
  '<div class="grid" markdown>',
  "",
  ...detailCards(plan, config),
  "</div>",
];

export const presetSnippet = async (p: PlannedPreset): Promise<string> => {
  const head = `\`${p.name}\` targets ${p.config.node_target} nodes and a score of ${p.config.vcs_target}.`;
  const plan = p.outcome.plan;
  if (!plan) {
    const why = [p.outcome.reason, ...p.outcome.violations].join("\n");
    return [head, "No plan is offered:", "", fence(why, "text")].join("\n");
  }
  const alt = `The overview under ${p.name}, with ${plan.groups.length} group nodes`;
  return [head, "", ...(await overviewCards(plan, alt)), "", ...planLines(plan, p.config)].join("\n");
};

export const tableSnippet = (planned: PlannedPreset[]): string => {
  const rows = planned.map(({ name, config, outcome: { plan } }) =>
    plan
      ? `| \`${name}\` | ${targets(config)} | ${plan.tier} | ${plan.overviewNodes} / ${num(plan.overviewScore)} | ${plan.details.length} | ${plan.loss.newReachablePairs} |`
      : `| \`${name}\` | ${targets(config)} | No plan | None | None | None |`,
  );
  return [
    "| Preset | `nodeTarget` / `vcsTarget` | Tier | Overview nodes / score | Details | New reachable pairs |",
    "|---|---|---|---|---:|---:|",
    ...rows,
  ].join("\n");
};

// The worked examples, in page order: the shop architecture, with its
// snippets named as before, then the decision-heavy flow, its names prefixed.
export const EXAMPLES: Array<{ step: Step; prefix: string }> = [
  { step: DIAGRAM, prefix: "" },
  { step: DECISIONS, prefix: "decisions-" },
];

// Every snippet, keyed by its path under docs-site/snippets/, in page order.
export const splitSnippets = async (): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const { step, prefix } of EXAMPLES) {
    const planned = await planPresets(step.source);
    out[`summarisation/${step.slug}.md`] = stepSnippet(await measureStep(step));
    out[`summarisation/${prefix}presets.md`] = tableSnippet(planned);
    for (const p of planned) out[`summarisation/${prefix}${p.name}.md`] = await presetSnippet(p);
  }
  return out;
};
