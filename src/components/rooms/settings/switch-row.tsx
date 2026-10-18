"use client";

import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** A labelled switch with help text (controlled; the caller saves). */
export function SwitchRow({
  label,
  help,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  help: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} id={`${id}-l`} className="cursor-pointer">
          {label}
        </Label>
        <p id={`${id}-h`} className="mt-1 text-sm text-muted-foreground">
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-h`}
        className="mt-0.5"
        data-testid={testId}
      />
    </div>
  );
}
