"use client";

import type { ComponentType } from "react";

import { VizFrameContext } from "@/components/guide/svg/VizSvg";
import type { Frame } from "@/lib/guide/contracts";

import type { RendererProps } from "./TracePlayer";

// Thumbnails lay out at this width (so a whole row fits, as in the figure) and
// are scaled down by the SVG viewBox to the thumbnail box (about 160 px).
const THUMB_LAYOUT_W = 320;
const HIDDEN = { descId: null, hidden: true } as const;
const noop = () => {};

/** Small multiples of the frames flagged `key`; clicking one seeks to it. */
export function KeySteps<S>({
  frames,
  Renderer,
  current,
  open,
  onToggle,
  onSeek,
}: {
  frames: readonly Frame<S>[];
  Renderer: ComponentType<RendererProps<S>>;
  /** Index of the frame on screen: key steps up to it are drawn as passed squares. */
  current: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  onSeek: (index: number) => void;
}) {
  const keys: number[] = [];
  frames.forEach((f, i) => {
    if (f.key && keys.length < 6) keys.push(i);
  });
  if (keys.length === 0) return null;
  return (
    <details
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      data-player-keysteps=""
    >
      <summary className="guide-player-summary">
        Key steps ({keys.length})
        <span aria-hidden="true" className="test-squares ml-1">
          {keys.map((i) => (
            <i key={i} data-state={i <= current ? "pass" : "pending"} />
          ))}
        </span>
      </summary>
      <ol className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {keys.map((i) => {
          const f = frames[i] as Frame<S>;
          return (
            <li key={`key-step-${i}`}>
              <button
                type="button"
                onClick={() => onSeek(i)}
                className="guide-keystep"
                data-keystep={i + 1}
                data-seen={i <= current || undefined}
              >
                <span className="viz-figure-bg block w-full overflow-hidden rounded-[10px] border border-border" aria-hidden="true">
                  <VizFrameContext.Provider value={HIDDEN}>
                    <Renderer
                      frame={f}
                      prev={i > 0 ? (frames[i - 1] as Frame<S>) : null}
                      width={THUMB_LAYOUT_W}
                      motion={false}
                      hovered={null}
                      onHover={noop}
                      mode="thumb"
                    />
                  </VizFrameContext.Provider>
                </span>
                <span className="guide-keystep-no">Step {i + 1}</span>
                <span className="text-muted-foreground">{f.narration}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
