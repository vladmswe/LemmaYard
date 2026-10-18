"use client";

export function stepLabel(step: number, total: number, phase: string): string {
  return `Step ${step} of ${total} · ${phase}`;
}

export function announcement(step: number, total: number, phase: string, narration: string): string {
  return `Step ${step} of ${total}. ${phase}. ${narration}`;
}

/**
 * Visible caption under the figure. It follows every frame (also during
 * autoplay), so it is hidden from assistive tech; screen readers get the
 * paced live region below instead.
 */
export function StepCaption({ label, narration }: { label: string; narration: string }) {
  return (
    <div aria-hidden="true" className="guide-caption" data-player-caption="">
      <p className="guide-caption-step" data-player-step="">
        {label}
      </p>
      <p className="guide-caption-text" data-player-caption-text="">
        {narration}
      </p>
    </div>
  );
}

/** The one polite live region of a player; present in the server HTML. */
export function LiveRegion({ text }: { text: string }) {
  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only" data-player-narration="">
      {text}
    </p>
  );
}

/** Visually hidden full-text description of the current state (labels the SVG). */
export function StateDescription({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="sr-only" data-player-desc="">
      {text}
    </p>
  );
}
