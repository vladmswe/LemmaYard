// Renderer checks without a browser (AC-G-2-15): render a structure's renderer
// to static SVG markup and inspect the attributes. Shared by the M-G2 lesson
// test folders (complexity-basics, arrays, dynamic-arrays).
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import type { Frame, VizModel } from "@/lib/guide/contracts";
import { textWidth } from "@/lib/guide/layout/text";

export const FULL_WIDTHS = [288, 390, 640, 1040] as const;
export const THUMB_WIDTH = 320; // KeySteps lays thumbnails out at this width

const FONT: Record<string, number> = { "viz-text": 14, "viz-label": 12, "viz-pointer": 13 };
const PAINT_OK = /^(none|currentColor|var\(--viz-[a-z-]+\))$/;
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\(/;
const EPS = 0.5;

interface Node {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly dx: number; // absolute translation of this element's coordinate system
  readonly dy: number;
  text: string;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1] as string] = m[2] as string;
  return out;
}

function translateOf(attrs: Record<string, string>): { x: number; y: number } {
  const src = `${attrs.transform ?? ""} ${attrs.style ?? ""}`;
  const m = /translate\(\s*(-?[\d.e+-]+)(?:px)?\s*,\s*(-?[\d.e+-]+)(?:px)?\s*\)/.exec(src);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}

function unescape(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

/** Elements of the markup with their absolute translation (enough for this structure of SVG). */
export function parseSvg(markup: string): Node[] {
  const nodes: Node[] = [];
  const stack: Node[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (const m of markup.matchAll(re)) {
    if (m[5] !== undefined) {
      const top = stack[stack.length - 1];
      if (top) top.text += unescape(m[5]);
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2] as string;
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = parseAttrs(m[3] ?? "");
    const parent = stack[stack.length - 1];
    const t = translateOf(attrs);
    const node: Node = { tag, attrs, dx: (parent?.dx ?? 0) + t.x, dy: (parent?.dy ?? 0) + t.y, text: "" };
    nodes.push(node);
    if (m[4] !== "/") stack.push(node);
  }
  return nodes;
}

const num = (v: string | undefined, d = 0) => (v === undefined ? d : Number(v));

/** Problems found in one rendering; empty = fine. */
export function inspectSvg(markup: string, opts: { ids: readonly string[]; thumb: boolean }): string[] {
  const issues: string[] = [];
  const nodes = parseSvg(markup);
  const svg = nodes.find((n) => n.tag === "svg");
  if (!svg) return ["no <svg> element"];
  const W = num(svg.attrs.width);
  const H = num(svg.attrs.height);
  if (!(W > 0) || !(H > 0)) issues.push(`svg size ${svg.attrs.width} x ${svg.attrs.height}`);

  const seenIds = new Set<string>();
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n.attrs)) {
      if (/NaN|undefined|Infinity|null/.test(v)) issues.push(`<${n.tag} ${k}="${v}">`);
      if ((k === "fill" || k === "stroke") && !PAINT_OK.test(v)) issues.push(`<${n.tag} ${k}="${v}"> is not a --viz-* token`);
      if (k === "style" && /(^|;)\s*(fill|stroke|color)\s*:/.test(v)) {
        for (const decl of v.split(";")) {
          const [prop, val] = decl.split(":").map((x) => x.trim());
          if ((prop === "fill" || prop === "stroke" || prop === "color") && val && !PAINT_OK.test(val)) {
            issues.push(`<${n.tag} style ${prop}: ${val}> is not a --viz-* token`);
          }
        }
      }
      if (COLOUR_LITERAL.test(v) && k !== "d") issues.push(`colour literal in <${n.tag} ${k}="${v}">`);
      if (k === "font-size" && Number.parseFloat(v) < 12) issues.push(`font-size ${v}`);
      if (k === "style" && /font-size\s*:\s*([\d.]+)/.test(v) && Number.parseFloat(/font-size\s*:\s*([\d.]+)/.exec(v)![1]!) < 12) {
        issues.push(`style font-size in ${v}`);
      }
    }
    if (n.attrs["data-id"] !== undefined) seenIds.add(n.attrs["data-id"]);

    const inX = (x: number, what: string) => {
      if (x < -EPS || x > W + EPS) issues.push(`${what} x=${x.toFixed(1)} outside [0, ${W}]`);
    };
    const inY = (y: number, what: string) => {
      if (y < -EPS || y > H + EPS) issues.push(`${what} y=${y.toFixed(1)} outside [0, ${H}]`);
    };
    switch (n.tag) {
      case "rect": {
        const x = n.dx + num(n.attrs.x);
        const y = n.dy + num(n.attrs.y);
        inX(x, "rect");
        inX(x + num(n.attrs.width), "rect right");
        inY(y, "rect");
        inY(y + num(n.attrs.height), "rect bottom");
        break;
      }
      case "line":
        inX(n.dx + num(n.attrs.x1), "line");
        inX(n.dx + num(n.attrs.x2), "line");
        inY(n.dy + num(n.attrs.y1), "line");
        inY(n.dy + num(n.attrs.y2), "line");
        break;
      case "circle": {
        const r = num(n.attrs.r);
        inX(n.dx + num(n.attrs.cx) - r, "circle");
        inX(n.dx + num(n.attrs.cx) + r, "circle");
        inY(n.dy + num(n.attrs.cy) - r, "circle");
        inY(n.dy + num(n.attrs.cy) + r, "circle");
        break;
      }
      case "text": {
        const cls = (n.attrs.class ?? "").split(/\s+/).find((c) => c in FONT);
        if (!cls) {
          issues.push(`<text> without a viz text class: "${n.text}"`);
          break;
        }
        const size = FONT[cls] as number;
        const w = textWidth(n.text, size);
        const x = n.dx + num(n.attrs.x);
        const anchor = n.attrs["text-anchor"] ?? "start";
        const [x0, x1] = anchor === "middle" ? [x - w / 2, x + w / 2] : anchor === "end" ? [x - w, x] : [x, x + w];
        inX(x0, `text "${n.text}" left`);
        inX(x1, `text "${n.text}" right`);
        inY(n.dy + num(n.attrs.y), `text "${n.text}"`);
        break;
      }
    }
  }
  if (opts.thumb) {
    if (seenIds.size > 0) issues.push(`thumbnail renders data-id (${[...seenIds].slice(0, 3).join(", ")})`);
  } else {
    for (const id of opts.ids) if (!seenIds.has(id)) issues.push(`no data-id element for "${id}"`);
  }
  return issues;
}

export function renderFrame<S>(
  Renderer: ComponentType<RendererProps<S>>,
  frame: Frame<S>,
  prev: Frame<S> | null,
  width: number,
  mode: "full" | "thumb",
): string {
  return renderToStaticMarkup(
    createElement(Renderer, { frame, prev, width, motion: false, hovered: null, onHover: () => {}, mode }),
  );
}

/**
 * Renders every frame of every input at the four full widths and as a
 * thumbnail; returns the first problems found (empty = all good).
 */
export function checkRenderer<S, I>(
  model: VizModel<S, I>,
  Renderer: ComponentType<RendererProps<S>>,
  inputs: readonly I[],
  limit = 10,
): string[] {
  const out: string[] = [];
  for (const [k, input] of inputs.entries()) {
    const frames = model.generate(input).frames;
    frames.forEach((frame, i) => {
      const prev = i > 0 ? (frames[i - 1] as Frame<S>) : null;
      const ids = model.ids(frame.state);
      for (const width of FULL_WIDTHS) {
        if (out.length >= limit) return;
        const issues = inspectSvg(renderFrame(Renderer, frame, prev, width, "full"), { ids, thumb: false });
        for (const msg of issues.slice(0, 3)) out.push(`input ${k}, frame ${i}, width ${width}: ${msg}`);
      }
      if (out.length >= limit) return;
      const issues = inspectSvg(renderFrame(Renderer, frame, prev, THUMB_WIDTH, "thumb"), { ids, thumb: true });
      for (const msg of issues.slice(0, 3)) out.push(`input ${k}, frame ${i}, thumb: ${msg}`);
    });
  }
  return out.slice(0, limit);
}
