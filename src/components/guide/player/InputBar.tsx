"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PresetButton {
  readonly id: string;
  readonly label: string;
}

/** Custom input: labelled text field + help + error (aria-describedby), Apply, presets. */
export function InputBar({
  idPrefix,
  label,
  placeholder,
  help,
  raw,
  error,
  presets,
  onRawChange,
  onApply,
  onPreset,
}: {
  idPrefix: string;
  label: string;
  placeholder: string;
  help: string;
  raw: string;
  error: string | null;
  presets: readonly PresetButton[];
  onRawChange: (raw: string) => void;
  onApply: () => void;
  onPreset: (id: string) => void;
}) {
  const fieldId = `${idPrefix}-input`;
  const helpId = `${idPrefix}-input-help`;
  const errorId = `${idPrefix}-input-error`;
  return (
    <div className="space-y-2" data-player-input="">
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
      >
        <label htmlFor={fieldId} className="text-sm font-semibold">
          {label}
        </label>
        <div className="flex gap-2">
          <Input
            id={fieldId}
            value={raw}
            placeholder={placeholder}
            onChange={(e) => onRawChange(e.target.value)}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== null ? true : undefined}
            aria-describedby={error !== null ? `${helpId} ${errorId}` : helpId}
            className="h-11 font-mono"
            data-player-input-field=""
          />
          <Button type="submit" className="min-h-11 px-4">
            Apply
          </Button>
        </div>
        <p id={helpId} className="text-sm text-muted-foreground">
          {help}
        </p>
        {error !== null && (
          <p id={errorId} className="text-sm font-medium text-danger" data-player-input-error="">
            {error}
          </p>
        )}
      </form>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Examples" role="group">
          {presets.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="secondary"
              className="h-auto min-h-11 min-w-11 max-w-full px-3.5 py-2 whitespace-normal"
              data-preset={p.id}
              onClick={() => onPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
