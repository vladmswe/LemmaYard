"use client";

import type { ComponentType } from "react";

import { VizFrameContext } from "@/components/guide/svg/VizSvg";
import type { Frame } from "@/lib/guide/contracts";

import type { RendererProps } from "./TracePlayer";

const THUMB_W = 160;
const HIDDEN = { descId: null, hidden: true } as const;
const noop = () => {};

/** Small multiples of the frames flagged `key`; clicking one seeks to it. */
export function KeySteps<S>({
  frames,
  Renderer,
  open,
  onToggle,
  onSeek,
}: {
  frames: readonly Frame<S>[];
  Renderer: ComponentType<RendererProps<S>>;
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
      <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        Key steps ({keys.length})
      </summary>
      <ol className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {keys.map((i) => {
          const f = frames[i] as Frame<S>;
          return (
            <li key={`key-step-${i}`}>
              <button
                type="button"
                onClick={() => onSeek(i)}
                className="flex h-full w-full flex-col items-start gap-1 rounded-lg border border-border p-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                data-keystep={i + 1}
              >
                <span className="viz-figure-bg block w-full overflow-hidden rounded-md" aria-hidden="true">
                  <VizFrameContext.Provider value={HIDDEN}>
                    <Renderer
                      frame={f}
                      prev={i > 0 ? (frames[i - 1] as Frame<S>) : null}
                      width={THUMB_W}
                      motion={false}
                      hovered={null}
                      onHover={noop}
                      mode="thumb"
                    />
                  </VizFrameContext.Provider>
                </span>
                <span className="font-medium">Step {i + 1}</span>
                <span className="text-muted-foreground">{f.narration}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
