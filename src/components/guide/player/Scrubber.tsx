"use client";

export function stepValueText(step: number, total: number, phase: string): string {
  return `Step ${step} of ${total}: ${phase}`;
}

/** Above this many steps the segments would be hairlines: draw one continuous fill instead. */
const MAX_SEGMENTS = 48;

/**
 * Native range input over the 1-based steps; aria-valuetext names the phase.
 * Behind it, a decorative strip of step segments (the test squares, stretched;
 * DESIGN.md §13.9): done, current, to come.
 */
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
      <label htmlFor={id} className="guide-scrub-label">
        Step
      </label>
      <span className="guide-scrub">
        <span aria-hidden="true" className="guide-scrub-track" data-segments={frameCount <= MAX_SEGMENTS || undefined}>
          {frameCount <= MAX_SEGMENTS ? (
            Array.from({ length: frameCount }, (_, i) => (
              <i key={i} data-state={i < index ? "done" : i === index ? "current" : "todo"} />
            ))
          ) : (
            <i
              data-state="fill"
              style={{ transform: `scaleX(${frameCount > 1 ? index / (frameCount - 1) : 1})` }}
            />
          )}
        </span>
      <input
        id={id}
        type="range"
        min={1}
        max={frameCount}
        step={1}
        value={index + 1}
        aria-valuetext={stepValueText(index + 1, frameCount, phase)}
        onChange={(e) => onSeek(Number(e.target.value) - 1)}
        className="guide-scrub-input"
        data-player-scrubber=""
      />
      </span>
    </div>
  );
}
