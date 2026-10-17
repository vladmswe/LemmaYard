// Predict prompts must not give their answer away (lead review, round 2): a
// prompt on frame k is asked while frame k - 1 is on screen, so the answer
// choice's label must not appear in frame k - 1's narration or phase, as a
// whole number (decimals count as one token) or as a whole phrase. A
// heuristic: each prompt is also reviewed by eye. Shared by the M-G2 folders.
import type { Trace } from "@/lib/guide/contracts";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pattern that finds `label` as a whole number or a whole phrase. */
export function wholeMatch(label: string): RegExp {
  return /^-?\d+$/.test(label)
    ? new RegExp(`(?<![\\d.])${escape(label)}(?![\\d.])`)
    : new RegExp(`(?<![A-Za-z0-9])${escape(label)}(?![A-Za-z0-9])`, "i");
}

/** One message per prompt whose answer shows on the frame before it; [] = fine. */
export function promptLeaks(trace: Trace<unknown>): string[] {
  const out: string[] = [];
  trace.frames.forEach((f, k) => {
    const p = f.prompt;
    if (!p || k === 0) return;
    const prev = trace.frames[k - 1]!;
    const answer = p.choices.find((c) => c.id === p.answerId)?.label ?? "";
    const re = wholeMatch(answer);
    for (const [field, text] of [
      ["narration", prev.narration],
      ["phase", prev.phase],
    ] as const) {
      if (re.test(text)) out.push(`${trace.vizId} prompt "${p.id}": answer "${answer}" is in frame ${k - 1}'s ${field}: ${text}`);
    }
  });
  return out;
}

/** Number of prompts in the trace, so a test can tell it checked something. */
export function promptCount(trace: Trace<unknown>): number {
  return trace.frames.filter((f) => f.prompt).length;
}
