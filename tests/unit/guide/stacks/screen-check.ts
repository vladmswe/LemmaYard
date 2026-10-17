// Stronger prompt check for the M-G4 players: besides narration and phase
// (prompt-check.ts), the answer must not be readable from the state shown
// while the prompt is open: the stack's top value, the ring's size or the
// tail slot, or the figure's header lines. Shared by stacks/ and queues-and-deques/.
import type { ComponentType } from "react";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import type { Trace } from "@/lib/guide/contracts";

import { wholeMatch } from "../complexity-basics/prompt-check";
import { parseSvg, renderFrame } from "../complexity-basics/render-check";

/** Text of the figure's header lines (the labels above the drawing, y <= 42). */
export function headerTexts(markup: string): string[] {
  return parseSvg(markup)
    .filter((n) => n.tag === "text" && n.dx === 0 && n.dy === 0 && Number(n.attrs.y) <= 42)
    .map((n) => n.text);
}

/**
 * One message per prompt whose answer can be read on the frame before it.
 * `shown(state)` lists the values the state puts on screen in a way that would
 * answer the question (e.g. the top value); the header is checked as rendered.
 */
export function screenLeaks<S>(
  trace: Trace<S>,
  /** null skips the header check (random inputs: a header number may equal the answer by chance). */
  Renderer: ComponentType<RendererProps<S>> | null,
  shown: (state: S, pointers: Readonly<Record<string, string | null>> | undefined) => readonly string[],
): string[] {
  const out: string[] = [];
  trace.frames.forEach((f, k) => {
    const p = f.prompt;
    if (!p || k === 0) return;
    const prev = trace.frames[k - 1]!;
    const answer = p.choices.find((c) => c.id === p.answerId)?.label ?? "";
    for (const v of shown(prev.state, prev.pointers)) {
      if (v === answer) out.push(`${trace.vizId} "${p.id}": answer "${answer}" is shown by the state of frame ${k - 1}`);
    }
    if (!Renderer) return;
    const re = wholeMatch(answer);
    for (const h of headerTexts(renderFrame(Renderer, prev, k > 1 ? trace.frames[k - 2]! : null, 640, "full"))) {
      if (re.test(h)) out.push(`${trace.vizId} "${p.id}": answer "${answer}" is in the header of frame ${k - 1}: ${h}`);
    }
  });
  return out;
}
