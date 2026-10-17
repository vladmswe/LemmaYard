"use client";

import type { VizClientProps } from "@/lib/guide/contracts";

/**
 * Stand-in for a structure's player in the fixture lesson: shows what the
 * server <Viz> passed (frame count, the code lines each line id maps to).
 */
export function FixtureVizClient<I>({ playerId, vizId, initialTrace, code, hint }: VizClientProps<I>) {
  const lineIds = [...new Set(initialTrace.frames.map((f) => f.line).filter((l): l is string => l !== null))];
  return (
    <div className="rounded-lg border p-4" data-fixture-viz={playerId} data-viz-id={vizId}>
      <p>
        Frames: <span data-fixture-frames="">{initialTrace.frames.length}</span>
      </p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <ul className="mt-2 text-sm">
        {lineIds.map((id) => (
          <li key={id} data-fixture-line={id}>
            <code>{id}</code>: Python lines{" "}
            <span data-lines="python">{(code?.python.lineMap[id] ?? []).join(" ")}</span>, JavaScript lines{" "}
            <span data-lines="javascript">{(code?.javascript.lineMap[id] ?? []).join(" ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
