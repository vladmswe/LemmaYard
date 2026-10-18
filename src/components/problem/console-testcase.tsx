"use client";

import { CircleAlertIcon, PencilIcon } from "lucide-react";
import { useId } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatValue } from "@/lib/problems/samples";
import type { Signature } from "@/lib/problems/schema";
import type { CustomInputFields, CustomInputResult } from "@/lib/workspace/custom-input";

export type TestMode = "samples" | "custom";

export type ConsoleTestcaseProps = {
  signature: Signature;
  samples: { input: Record<string, unknown>; expected: unknown }[];
  mode: TestMode;
  onModeChange: (mode: TestMode) => void;
  selectedSample: number;
  onSelectSample: (index: number) => void;
  fields: CustomInputFields;
  onFieldChange: (name: string, text: string) => void;
  /** Prefills the custom fields from sample `index` and switches to custom mode. */
  onUseSample: (index: number) => void;
  validation: CustomInputResult;
};

/**
 * Case pills (DESIGN.md §13.4): 32px (40px on touch layouts), radius 8,
 * mono 13px; selected = ink border + a 3px halo (`tone="fail"`: danger).
 */
export function pillClasses(selected: boolean, tone: "fail" | null = null) {
  return cn(
    "inline-flex h-8 items-center gap-2 rounded-[8px] border bg-card px-3 font-mono text-[0.8125rem] font-medium transition-[color,border-color,box-shadow] duration-120 max-md:h-10",
    selected
      ? tone === "fail"
        ? "border-verdict-wrong text-foreground shadow-[0_0_0_3px_var(--verdict-wrong-bg)]"
        : "border-foreground-secondary text-foreground shadow-[0_0_0_3px_var(--highlight)]"
      : "border-border text-foreground-secondary hover:border-border-strong hover:text-foreground",
  );
}

/** Mono value block (IO style): sunken, hairline, radius 8. */
export const valueBlockClasses =
  "rounded-[8px] border bg-surface-sunken px-3 py-2 font-mono text-[0.8125rem]/[1.6] whitespace-pre-wrap break-all text-foreground md:text-sm/[1.6]";

/** Mono uppercase label above an IO block ("INPUT", "EXPECTED"). */
export const ioLabelClasses = "label-mono text-muted-foreground";

export function ConsoleTestcase(props: ConsoleTestcaseProps) {
  const { mode, onModeChange, samples } = props;
  return (
    <div className="flex flex-col gap-4" data-testid="console-testcase">
      <Segmented
        label="Test input"
        className="self-start"
        value={mode}
        onValueChange={onModeChange}
        options={[
          { value: "samples", label: `Sample cases (${samples.length})` },
          { value: "custom", label: "Custom input" },
        ]}
      />
      {mode === "samples" ? <SamplesView {...props} /> : <CustomInputView {...props} />}
    </div>
  );
}

function SamplesView({ signature, samples, selectedSample, onSelectSample, onUseSample }: ConsoleTestcaseProps) {
  const sample = samples[selectedSample];
  if (!sample) {
    return <p className="text-sm text-muted-foreground">This problem has no sample cases.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Run checks your code on {samples.length === 1 ? "the sample case" : `all ${samples.length} sample cases`}.
      </p>
      <div role="group" aria-label="Sample cases" className="flex flex-wrap gap-2">
        {samples.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={i === selectedSample}
            className={pillClasses(i === selectedSample)}
            onClick={() => onSelectSample(i)}
          >
            Case {i + 1}
          </button>
        ))}
      </div>
      {signature.params.map((p) => (
        <div key={p.name} className="flex flex-col gap-1.5">
          <span className={ioLabelClasses}>
            <span className="normal-case">{p.name}</span> =
          </span>
          <div className={valueBlockClasses}>{formatValue(sample.input[p.name])}</div>
        </div>
      ))}
      <div>
        <Button variant="ghost" size="sm" onClick={() => onUseSample(selectedSample)}>
          <PencilIcon aria-hidden />
          Edit as custom input
        </Button>
      </div>
    </div>
  );
}

function CustomInputView({
  signature,
  samples,
  fields,
  onFieldChange,
  onUseSample,
  validation,
}: ConsoleTestcaseProps) {
  const baseId = useId();
  const fieldErrors = validation.ok ? {} : validation.fieldErrors;
  const formError = validation.ok ? undefined : validation.formError;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Run uses this input once and shows the output. There is no expected answer to compare with.
      </p>
      {samples.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {samples.map((_, i) => (
            <Button key={i} variant="ghost" size="sm" onClick={() => onUseSample(i)}>
              Use sample {i + 1}
            </Button>
          ))}
        </div>
      )}
      {signature.params.map((p) => {
        const id = `${baseId}-${p.name}`;
        const error = fieldErrors[p.name];
        return (
          <div key={p.name} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-semibold text-foreground">
              <span className="font-mono">{p.name}</span>{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground">{p.type}</span>
            </label>
            <Textarea
              id={id}
              data-testid={`custom-input-${p.name}`}
              value={fields[p.name] ?? ""}
              onChange={(e) => onFieldChange(p.name, e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              rows={1}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="min-h-10 font-mono text-sm"
            />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        JSON values: arrays <span className="font-mono">[1, 2]</span>, strings{" "}
        <span className="font-mono">&quot;abc&quot;</span>, <span className="font-mono">true</span> /{" "}
        <span className="font-mono">false</span>.
      </p>
      {formError && (
        <p className="flex gap-1.5 text-sm text-danger" data-testid="custom-input-error">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      )}
    </div>
  );
}
