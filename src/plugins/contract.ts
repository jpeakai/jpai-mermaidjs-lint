// What a plugin is: an ES module whose default export is a Plugin, or, for a
// local rule, one PluginRule per file. The context a plugin rule receives is
// the one the built-ins read, so a plugin rule is a built-in with a namespace.

import type { Awaitable, CheckContext, Edit, Finding, FixContext, OptionSpec } from "../rules/types.ts";

// Bumped when the contract changes in a way a plugin must notice. A plugin
// that targets another version fails to load with both numbers in the message.
export const API_VERSION = 1;

// What a plugin returns. The engine adds the rule id and the file to a finding,
// and the rule id to an edit, so a plugin cannot report as another rule.
export type PluginFinding = Pick<Finding, "line" | "message"> & Partial<Pick<Finding, "endLine" | "remediation">>;

export type PluginEdit = Omit<Edit, "rule">;

export interface PluginRule {
  category: string;
  summary: string;
  options?: OptionSpec;
  check: (ctx: CheckContext) => Awaitable<PluginFinding[]>;
  fix?: (ctx: FixContext) => Awaitable<PluginEdit[]>;
}

export interface PluginMeta {
  name: string;
  namespace: string;
  apiVersion: number;
  // A new category the plugin adds, as the word and a one-line description.
  categories?: Record<string, string>;
}

export interface Plugin {
  meta: PluginMeta;
  rules: Record<string, PluginRule>;
}

// A one-word category and a namespace or rule key, as they appear in an id.
export const CATEGORY_WORD = /^[a-z]+$/;
export const NAMESPACE = /^[a-z][a-z0-9-]*$/;
export const RULE_KEY = /^[a-z][a-z0-9-]*$/;
