"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";

import { PlayerSwitch } from "./Switch";

const ICON_BTN = "size-11 [&_svg:not([class*='size-'])]:size-5";

export function MainControls({
  playing,
  promptOpen,
  onFirst,
  onPrev,
  onTogglePlay,
  onNext,
  onLast,
  nextRef,
}: {
  playing: boolean;
  promptOpen: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onLast: () => void;
  nextRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" data-player-main-controls="">
      <Button variant="outline" className={ICON_BTN} aria-label="First step" onClick={onFirst}>
        <ChevronFirst aria-hidden="true" />
      </Button>
      <Button variant="outline" className={ICON_BTN} aria-label="Previous step" onClick={onPrev}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button
        className={ICON_BTN}
        aria-label={playing ? "Pause" : "Play"}
        onClick={onTogglePlay}
        disabled={promptOpen}
        data-player-play=""
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <Button
        ref={nextRef}
        variant="outline"
        className={ICON_BTN}
        aria-label="Next step"
        onClick={onNext}
        disabled={promptOpen}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button variant="outline" className={ICON_BTN} aria-label="Last step" onClick={onLast}>
        <ChevronLast aria-hidden="true" />
      </Button>
    </div>
  );
}

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export function SecondaryControls({
  idPrefix,
  speed,
  onSpeed,
  motion,
  onMotion,
  skipPrompts,
  onSkipPrompts,
  showTable,
  onShowTable,
  onCopyLink,
  onReset,
}: {
  idPrefix: string;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  motion: boolean;
  onMotion: (on: boolean) => void;
  skipPrompts: boolean;
  onSkipPrompts: (on: boolean) => void;
  showTable: boolean | null; // null = no table view for this model
  onShowTable: (on: boolean) => void;
  onCopyLink: () => void;
  onReset: () => void;
}) {
  const speedId = `${idPrefix}-speed`;
  return (
    <div className="flex flex-wrap items-center gap-2" data-player-secondary-controls="">
      <div className="flex items-center gap-2">
        <label htmlFor={speedId} className="text-sm">
          Speed
        </label>
        <select
          id={speedId}
          value={String(speed)}
          onChange={(e) => onSpeed(Number(e.target.value) as Speed)}
          className="min-h-11 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          data-player-speed=""
        >
          {SPEEDS.map((s) => (
            <option key={s} value={String(s)}>
              {s}×
            </option>
          ))}
        </select>
      </div>
      <PlayerSwitch name="motion" label="Animations" checked={motion} onChange={onMotion} />
      <PlayerSwitch name="skip" label="Skip questions" checked={skipPrompts} onChange={onSkipPrompts} />
      {showTable !== null && (
        <PlayerSwitch name="table" label="Show as table" checked={showTable} onChange={onShowTable} />
      )}
      <Button variant="outline" className="min-h-11 px-3" onClick={onCopyLink}>
        Copy link to this step
      </Button>
      <Button variant="outline" className="min-h-11 px-3" onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}
