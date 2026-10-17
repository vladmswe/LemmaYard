"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";

/**
 * Number stepper: a labelled group with − / + buttons and the value as text.
 * Keyboard: the buttons are tab stops; the value is announced with the label.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  describedBy,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  describedBy?: string;
  /** Spoken unit ("problems"). */
  unit?: string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-l`} aria-describedby={describedBy} className="flex flex-col gap-1.5">
      <span id={`${id}-l`} className="text-sm font-semibold text-foreground">
        {label}
      </span>
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`Fewer: ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <MinusIcon aria-hidden />
        </Button>
        <output aria-live="polite" className="w-10 text-center text-[0.9375rem] font-semibold tabular-nums">
          {value}
          {unit && <span className="sr-only"> {unit}</span>}
        </output>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`More: ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <PlusIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
