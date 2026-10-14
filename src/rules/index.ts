// The rule catalogue, in id order. To add a rule: write one module exporting a
// Rule with its category, register it here, and add its section and examples to
// RULES.md, which tests/rules-doc.test.ts holds to the code.

import { complexityNodeCountAcceptableExceeded } from "./complexity-node-count-acceptable-exceeded.ts";
import { complexityNodeCountCognitiveLimit } from "./complexity-node-count-cognitive-limit.ts";
import { complexityNodeCountHardLimit } from "./complexity-node-count-hard-limit.ts";
import { complexitySubgraphNestingTooDeep } from "./complexity-subgraph-nesting-too-deep.ts";
import { complexityVisualScoreAcceptableExceeded } from "./complexity-visual-score-acceptable-exceeded.ts";
import { complexityVisualScoreCritical } from "./complexity-visual-score-critical.ts";
import { contrastBorderBelowUiMinimum } from "./contrast-border-below-ui-minimum.ts";
import { contrastDirectiveUnauditable } from "./contrast-directive-unauditable.ts";
import { contrastTextBelowAa } from "./contrast-text-below-aa.ts";
import { parseDiagramUnparseable } from "./parse-diagram-unparseable.ts";
import { parseFenceUnterminated } from "./parse-fence-unterminated.ts";
import type { Rule } from "./types.ts";

export const RULES: Rule[] = [
  parseDiagramUnparseable,
  parseFenceUnterminated,
  complexityNodeCountHardLimit,
  complexityNodeCountCognitiveLimit,
  complexityNodeCountAcceptableExceeded,
  complexityVisualScoreCritical,
  complexityVisualScoreAcceptableExceeded,
  complexitySubgraphNestingTooDeep,
  contrastTextBelowAa,
  contrastBorderBelowUiMinimum,
  contrastDirectiveUnauditable,
];

// The order fixers run in. A fence is closed before its colours are rewritten.
export const FIX_ORDER: Rule[] = [parseFenceUnterminated, contrastTextBelowAa];
