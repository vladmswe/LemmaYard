"use client";

export function stepValueText(step: number, total: number, phase: string): string {
  return `Step ${step} of ${total}: ${phase}`;
}

/** Native range input over the 1-based steps; aria-valuetext names the phase. */
export function Scrubber({
  id,
  index,
  frameCount,
  phase,
  onSeek,
}: {
  id: string;
  index: number;
  frameCount: number;
  phase: string;
  onSeek: (index: number) => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <label htmlFor={id} className="text-sm">
        Step
      </label>
      <input
        id={id}
        type="range"
        min={1}
        max={frameCount}
        step={1}
        value={index + 1}
        aria-valuetext={stepValueText(index + 1, frameCount, phase)}
        onChange={(e) => onSeek(Number(e.target.value) - 1)}
        className="h-11 min-w-0 flex-1 cursor-pointer accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-player-scrubber=""
      />
    </div>
  );
}
