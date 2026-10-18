"use client";

// Session setting fields shared by the lobby Setup card and the preset
// editor (Rooms v2 §2.3, §4): Duration 45/60/90/120/Other…, Pick problems
// By rating | By difficulty | I'll pick them, Challenge with its target
// share, Topics (≤ 5). Segmented controls are toggle groups with arrow keys
// (DESIGN.md §12 Segmented); the labels name the groups.
import { useId } from "react";

import { Chip, ChipCount } from "@/components/ui/chip";
import { FieldHelp } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { challengeHelp, challengeOptions, MODE_HELP, MODE_OPTIONS } from "@/lib/rooms/lobby-rating";
import { DURATION_STEP_MIN, MAX_DURATION_MIN, MAX_SESSION_TAGS, MIN_DURATION_MIN, type Challenge, type SelectionMode } from "@/lib/rooms/types";

import { NativeSelect } from "./native-select";

export const DURATION_SEGMENTS = [45, 60, 90, 120] as const;
const OTHER = "other";
const ALL_DURATIONS = Array.from(
  { length: (MAX_DURATION_MIN - MIN_DURATION_MIN) / DURATION_STEP_MIN + 1 },
  (_, i) => MIN_DURATION_MIN + i * DURATION_STEP_MIN,
);

export function DurationField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const isSegment = (DURATION_SEGMENTS as readonly number[]).includes(value);
  const segValue = isSegment ? String(value) : OTHER;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-l`} className="text-sm font-semibold text-foreground">
        Duration
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Duration"
          size="lg"
          value={segValue}
          onValueChange={(v) => {
            if (disabled) return;
            if (v === OTHER) onChange(isSegment ? 75 : value);
            else onChange(Number(v));
          }}
          options={[
            ...DURATION_SEGMENTS.map((d) => ({ value: String(d), label: <span data-testid={`duration-${d}`}>{d}</span> })),
            { value: OTHER, label: "Other…" },
          ]}
        />
        {!isSegment && (
          <NativeSelect
            aria-label="Duration in minutes"
            value={String(value)}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-32"
            data-testid="duration-other"
          >
            {ALL_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      <FieldHelp>Minutes{isSegment ? "" : `, ${MIN_DURATION_MIN}–${MAX_DURATION_MIN}`}.</FieldHelp>
    </div>
  );
}

export function ModeField({
  value,
  onChange,
  disabled,
}: {
  value: SelectionMode;
  onChange: (v: SelectionMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="mode-field">
      <span className="text-sm font-semibold text-foreground">Pick problems</span>
      <Segmented
        label="Pick problems"
        size="lg"
        value={value}
        onValueChange={(v) => !disabled && onChange(v)}
        options={MODE_OPTIONS}
        className="self-start"
      />
      <FieldHelp>{MODE_HELP[value]}</FieldHelp>
    </div>
  );
}

export function ChallengeField({
  mode,
  value,
  problemCount,
  onChange,
  disabled,
}: {
  mode: SelectionMode;
  value: Challenge;
  problemCount: number;
  onChange: (v: Challenge) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="challenge-field">
      <span className="text-sm font-semibold text-foreground">Challenge</span>
      <Segmented
        label="Challenge"
        size="lg"
        value={value}
        onValueChange={(v) => !disabled && onChange(v)}
        className="self-start"
        options={challengeOptions(mode).map((o) => ({
          value: o.value,
          label: (
            <>
              {o.name}
              <span className="font-mono text-xs opacity-80">{o.percent}</span>
            </>
          ),
        }))}
      />
      <FieldHelp>{challengeHelp(mode, value, problemCount)}</FieldHelp>
    </div>
  );
}

export function TopicsField({
  tags,
  value,
  onChange,
  disabled,
}: {
  tags: { slug: string; name: string; count: number }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const full = value.length >= MAX_SESSION_TAGS;
  return (
    <div role="group" aria-labelledby={`${id}-l`} aria-describedby={`${id}-h`} className="flex flex-col gap-2">
      <span id={`${id}-l`} className="text-sm font-semibold text-foreground">
        Topics
      </span>
      <FieldHelp id={`${id}-h`} className="-mt-1">
        {value.length === 0
          ? `Any topic. Pick up to ${MAX_SESSION_TAGS} to narrow the draw (problems with any of them).`
          : `${value.length} of ${MAX_SESSION_TAGS} chosen · problems with any of them.`}
      </FieldHelp>
      <div className="flex flex-wrap gap-2">
        <Chip pressed={value.length === 0} disabled={disabled} onClick={() => onChange([])}>
          Any
        </Chip>
        {tags.map((t) => {
          const on = value.includes(t.slug);
          return (
            <Chip
              key={t.slug}
              pressed={on}
              disabled={disabled || (!on && full)}
              onClick={() => onChange(on ? value.filter((x) => x !== t.slug) : [...value, t.slug])}
            >
              {t.name}
              <ChipCount>
                {t.count}
                <span className="sr-only">{t.count === 1 ? " problem" : " problems"}</span>
              </ChipCount>
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
