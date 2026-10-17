"use client";

import { cn } from "cn";

/**
 * Accessible on/off switch (native <button role="switch">). src/components/ui
 * has no Switch yet, so the player keeps its own small control here.
 */
export function PlayerSwitch({
  label,
  checked,
  onChange,
  name,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  name: string; // data-player-switch value, for tests
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-player-switch={name}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-border px-3 text-sm",
        "outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors",
          checked ? "border-primary bg-primary" : "border-muted-foreground bg-transparent",
        )}
      >
        <span
          className={cn(
            "inline-block size-3 rounded-full transition-transform",
            checked ? "translate-x-4 bg-primary-foreground" : "translate-x-0.5 bg-muted-foreground",
          )}
        />
      </span>
      <span aria-hidden="true" className="min-w-6 text-xs font-medium" data-switch-state="">
        {checked ? "on" : "off"}
      </span>
    </button>
  );
}
