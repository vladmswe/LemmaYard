"use client";

import type { CounterKey, Counters } from "@/lib/guide/contracts";

const LABELS: Record<CounterKey, string> = {
  comparisons: "Comparisons",
  reads: "Reads",
  writes: "Writes",
  moves: "Moves",
  copies: "Copies",
  swaps: "Swaps",
  pointerWrites: "Pointer writes",
  nodesVisited: "Nodes visited",
  probes: "Probes",
  hashes: "Hashes",
  resizes: "Resizes",
  allocations: "Allocations",
  edgesExamined: "Edges examined",
};

/** Cumulative operation counts of the current frame; a counter that changed shows "+n". */
export function CounterStrip({
  keys,
  counters,
  prev,
}: {
  keys: readonly CounterKey[];
  counters: Counters;
  prev: Counters | null;
}) {
  if (keys.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-2 text-sm" data-player-counters="">
      {keys.map((k) => {
        const v = counters[k] ?? 0;
        const delta = prev ? v - (prev[k] ?? 0) : 0;
        return (
          <span
            key={k}
            data-counter={k}
            data-changed={delta > 0 ? "true" : undefined}
            className="rounded-sm border border-border bg-surface-sunken px-2 py-1 font-mono text-[0.8125rem] tabular-nums"
          >
            {LABELS[k]} {v}
            {delta > 0 && <span className="ml-1 font-semibold">+{delta}</span>}
          </span>
        );
      })}
    </p>
  );
}
