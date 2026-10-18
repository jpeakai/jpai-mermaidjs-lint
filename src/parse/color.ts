// WCAG contrast math and the style directive shape. Colour parsing,
// conversion and contrast are delegated to colorjs.io, which reads every CSS
// Color Level 4 syntax.

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
// known, so this resolves it to the box a reader sees. An out-of-gamut channel
// is clipped, as a browser paints it on an sRGB page.
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
  return new Color("srgb", [ch(0), ch(1), ch(2)], outA)
    .toGamut({ method: "clip" })
    .toString({ format: "hex", collapse: false });
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
// What a diagram declares about its colours, read from mermaid's parser result
// by src/parse/styles.ts, never from the diagram text.

// Where a property's value sits in the diagram text, as a 1-based line and the
// 0-based columns of the value in that line.
export interface ValueSpan {
  line: number;
  start: number;
  end: number;
}

// One styled thing in the parser's result: a classDef, a node, entity, state
// or class that a style statement styles, or an edge that a linkStyle styles.
// properties are the declarations mermaid applies to it, the later winning,
// and a style or linkStyle directive's include those it inherits from its
// classes or the default linkStyle. spans holds only the values this
// directive's own statements wrote, and only where the parser places them
// exactly, so a fixer never rewrites a value it cannot place or one that
// another directive shares.
export interface StyleDirective {
  kind: "classDef" | "style" | "linkStyle";
  selector: string;
  properties: Record<string, string>;
  spans: Record<string, ValueSpan>;
  line: number; // 1-based, within the diagram text
}
