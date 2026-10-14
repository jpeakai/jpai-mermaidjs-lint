// WCAG contrast math and style-directive extraction. Colour parsing is
// delegated to colorjs.io, which reads every CSS Color Level 4 syntax.

import Color from "colorjs.io";

export type WcagRating = "AAA" | "AA" | "AA Large" | "Fail";

export interface ContrastAssessment {
  foreground: string;
  background: string;
  ratio: number; // WCAG 2.x, 1..21, rounded to 2dp
  rating: WcagRating;
  apca_lc: number;
}

export const wcagRatio = (fg: string, bg: string): number => new Color(fg).contrast(new Color(bg), "WCAG21");

export const apcaLc = (fg: string, bg: string): number => new Color(fg).contrast(new Color(bg), "APCA");

export const alphaOf = (color: string): number => new Color(color).to("srgb").alpha ?? 1;

// Simple alpha-over in gamma-encoded sRGB, the model browsers use for opacity.
// A translucent fill has no contrast of its own until the backdrop behind it is
// known, so this resolves it to the box a reader sees.
export const compositeOver = (fg: string, bg: string): string => {
  const f = new Color(fg).to("srgb");
  const b = new Color(bg).to("srgb");
  const fa = f.alpha ?? 1;
  const ba = b.alpha ?? 1;
  const outA = fa + ba * (1 - fa);
  const ch = (i: number): number => {
    if (outA === 0) return 0;
    return (fa * (f.coords[i] ?? 0) + ba * (1 - fa) * (b.coords[i] ?? 0)) / outA;
  };
  const hx = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${hx(ch(0))}${hx(ch(1))}${hx(ch(2))}`;
  return outA < 1 ? `${base}${hx(outA)}` : base;
};

export const wcagRating = (ratio: number): WcagRating => {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
};

export const wcagAssess = (fg: string, bg: string): ContrastAssessment => {
  const ratio = Math.round(wcagRatio(fg, bg) * 100) / 100;
  return {
    foreground: fg,
    background: bg,
    ratio,
    rating: wcagRating(ratio),
    apca_lc: Math.round(apcaLc(fg, bg) * 10) / 10,
  };
};

// ─── Mermaid style directives ────────────────────────────────────────────────
//
//   classDef NAME  fill:#X,stroke:#Y,color:#Z,stroke-width:2px
//   style NODEID   fill:#X,stroke:#Y,color:#Z
//   linkStyle 0,1  stroke:#X,stroke-width:2px
//   A:::className
//   A[label]:::className --> B

// Where a property's value sits in the diagram text, as a 1-based line and the
// 0-based columns of the value in that line.
export interface ValueSpan {
  line: number;
  start: number;
  end: number;
}

export interface StyleDirective {
  kind: "classDef" | "style" | "linkStyle" | "inlineClass";
  selector: string;
  class_name?: string;
  properties: Record<string, string>;
  spans: Record<string, ValueSpan>;
  line: number; // 1-based, within the diagram text
}

const CLASSDEF_RE = /^[ \t]*classDef\s+(\S+)\s+(.+?)\s*;?\s*$/di;
const STYLE_RE = /^[ \t]*style\s+(\S+)\s+(.+?)\s*;?\s*$/di;
const LINKSTYLE_RE = /^[ \t]*linkStyle\s+(\S+)\s+(.+?)\s*;?\s*$/di;
const INLINE_CLASS_RE = /([A-Za-z_][\w-]*)(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|>[^<]*)?:::([A-Za-z_][\w-]*)/g;

// Mermaid allows `,` and `;` between properties, and a value never contains
// either in well-formed source, so a plain split is safe.
const parseProperties = (
  raw: string,
  rawStart: number,
  line: number,
): { properties: Record<string, string>; spans: Record<string, ValueSpan> } => {
  const properties: Record<string, string> = {};
  const spans: Record<string, ValueSpan> = {};
  let at = 0;
  for (const pair of raw.split(/[,;]/)) {
    const pairStart = at;
    at += pair.length + 1;
    const colon = pair.indexOf(":");
    if (colon === -1) continue;
    const key = pair.slice(0, colon).trim().toLowerCase();
    const valueRaw = pair.slice(colon + 1);
    const value = valueRaw.trim();
    if (!key || !value) continue;
    properties[key] = value;
    const lead = valueRaw.length - valueRaw.trimStart().length;
    const start = rawStart + pairStart + colon + 1 + lead;
    spans[key] = { line, start, end: start + value.length };
  }
  return { properties, spans };
};

export const extractStyleDirectives = (source: string): StyleDirective[] => {
  const out: StyleDirective[] = [];
  const lines = source.split("\n");
  for (const [i, line] of lines.entries()) {
    const lineNo = i + 1;
    let matched = false;
    for (const [kind, re] of [
      ["classDef", CLASSDEF_RE],
      ["style", STYLE_RE],
      ["linkStyle", LINKSTYLE_RE],
    ] as const) {
      const m = re.exec(line);
      const rawStart = m?.indices?.[2]?.[0];
      if (m && rawStart !== undefined) {
        out.push({
          kind,
          selector: m[1] ?? "",
          ...parseProperties(m[2] ?? "", rawStart, lineNo),
          line: lineNo,
        });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    for (const inline of line.matchAll(INLINE_CLASS_RE)) {
      out.push({
        kind: "inlineClass",
        selector: inline[1] ?? "",
        class_name: inline[2] ?? "",
        properties: {},
        spans: {},
        line: lineNo,
      });
    }
  }
  return out;
};
