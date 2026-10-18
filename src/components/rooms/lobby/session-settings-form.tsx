"use client";

// Lobby settings of the host (docs/specs/rooms.md §2.1, §7.4
// SessionSettingsForm): problem count 1–8, duration, topics (≤ 5, with
// counts), difficulty Suggested / Custom (three steppers), challenge,
// "Avoid problems someone has already solved", optional planned date.
// Changes are applied together with "Apply and draw" (only changed fields are
// sent; a change of count, topics or mix re-draws the unpinned slots).
import { DicesIcon } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CHALLENGE_COPY,
  DIFFICULTY_LABEL,
  DURATION_PRESETS,
  durationLabel,
  formFromLobby,
  mixError,
  settingsDiff,
  type LobbyForm,
} from "@/lib/rooms/lobby-copy";
import type { SessionSettingsBody } from "@/lib/rooms/session-schemas";
import type { LobbyView } from "@/lib/rooms/session-view";
import { CHALLENGES, DIFFICULTIES, MAX_PROBLEM_COUNT, MAX_SESSION_TAGS, MIN_PROBLEM_COUNT, type Challenge } from "@/lib/rooms/types";
import type { SessionTag } from "@/server/rooms/session-page";

import { Stepper } from "./stepper";

export function SessionSettingsForm({
  lobby,
  tags,
  pending,
  onApply,
  onClean,
}: {
  lobby: LobbyView;
  tags: SessionTag[];
  pending: boolean;
  onApply: (body: SessionSettingsBody) => Promise<boolean>;
  /** Called when the form matches the saved settings again (e.g. after a failed draw is undone). */
  onClean?: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState<LobbyForm>(() => formFromLobby(lobby));
  const [base, setBase] = useState(lobby);
  // A new lobby view from the server (own or another manager's change) resets the form.
  if (base !== lobby) {
    setBase(lobby);
    setForm(formFromLobby(lobby));
  }
  const update = (patch: Partial<LobbyForm>) => setForm((f) => ({ ...f, ...patch }));
  const diff = settingsDiff(lobby, form);
  const dirty = Object.keys(diff).length > 0;
  const mixProblem = mixError(form);
  useEffect(() => {
    if (!dirty) onClean?.();
  }, [dirty, onClean]);
  const durations = DURATION_PRESETS.includes(form.durationMin as (typeof DURATION_PRESETS)[number])
    ? [...DURATION_PRESETS]
    : [...DURATION_PRESETS, form.durationMin].sort((a, b) => a - b);
  const tagLimit = form.tags.length >= MAX_SESSION_TAGS;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || mixProblem) return;
    await onApply(diff);
  }

  return (
    <form onSubmit={submit} aria-labelledby={`${id}-title`} className="flex flex-col gap-6" data-testid="session-settings">
      <h2 id={`${id}-title`} className="text-xl/7 font-semibold">
        Settings
      </h2>

      <div className="grid gap-6 sm:grid-cols-2">
        <Stepper
          label="Problems"
          unit="problems"
          value={form.problemCount}
          min={MIN_PROBLEM_COUNT}
          max={MAX_PROBLEM_COUNT}
          disabled={pending}
          onChange={(v) => update({ problemCount: v })}
        />
        <div className="flex flex-col gap-1.5">
          <Label id={`${id}-duration`}>Duration</Label>
          <Select
            value={String(form.durationMin)}
            onValueChange={(v) => v && update({ durationMin: Number(v) })}
            items={durations.map((d) => ({ value: String(d), label: durationLabel(d) }))}
            disabled={pending}
          >
            <SelectTrigger aria-labelledby={`${id}-duration`} className="w-full sm:w-56" data-testid="duration-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durations.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {durationLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-topics-help`}>
        <legend className="text-sm font-semibold text-foreground">Topics</legend>
        <FieldHelp id={`${id}-topics-help`} className="-mt-1">
          {form.tags.length === 0
            ? "Any topic. Pick up to 5 to narrow the draw (problems with any of them)."
            : `${form.tags.length} of ${MAX_SESSION_TAGS} chosen · problems with any of them.`}
        </FieldHelp>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const checked = form.tags.includes(t.slug);
            const inputId = `${id}-tag-${t.slug}`;
            return (
              <li key={t.slug}>
                <label
                  htmlFor={inputId}
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-120",
                    checked ? "border-blue-300 bg-secondary text-secondary-foreground" : "border-border-strong bg-card hover:bg-accent",
                    !checked && tagLimit && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={pending || (!checked && tagLimit)}
                    onCheckedChange={(v) =>
                      update({ tags: v ? [...form.tags, t.slug] : form.tags.filter((x) => x !== t.slug) })
                    }
                  />
                  {t.name}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t.count}
                    <span className="sr-only">{t.count === 1 ? " problem" : " problems"}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {form.tags.length > 0 && (
          <Button type="button" variant="link" size="sm" className="self-start" onClick={() => update({ tags: [] })}>
            Any topic
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-foreground">Difficulty</legend>
        <RadioGroup
          value={form.mixMode}
          onValueChange={(v) => {
            const mode = v as LobbyForm["mixMode"];
            update(
              mode === "manual" && form.mixMode !== "manual"
                ? { mixMode: mode, mix: lobby.calibration?.suggested ?? lobby.actualMix }
                : { mixMode: mode },
            );
          }}
          className="flex flex-wrap gap-x-6 gap-y-2"
          aria-label="Difficulty mix"
          disabled={pending}
        >
          {(["suggested", "manual"] as const).map((mode) => (
            <label key={mode} className="inline-flex h-10 cursor-pointer items-center gap-2 text-[0.9375rem]">
              <RadioGroupItem value={mode} />
              {mode === "suggested" ? "Suggested" : "Custom mix"}
            </label>
          ))}
        </RadioGroup>
        {form.mixMode === "manual" && (
          <div className="flex flex-wrap gap-6">
            {DIFFICULTIES.map((d) => (
              <Stepper
                key={d}
                label={DIFFICULTY_LABEL[d]}
                value={form.mix[d]}
                min={0}
                max={MAX_PROBLEM_COUNT}
                disabled={pending}
                describedBy={mixProblem ? `${id}-mix-error` : undefined}
                onChange={(v) => update({ mix: { ...form.mix, [d]: v } })}
              />
            ))}
          </div>
        )}
        {mixProblem && <FieldError id={`${id}-mix-error`}>{mixProblem}</FieldError>}
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label id={`${id}-challenge`}>Challenge</Label>
          <Select
            value={form.challenge}
            onValueChange={(v) => v && update({ challenge: v as Challenge })}
            items={CHALLENGES.map((c) => ({ value: c, label: CHALLENGE_COPY[c].label }))}
            disabled={pending}
          >
            <SelectTrigger
              aria-labelledby={`${id}-challenge`}
              aria-describedby={`${id}-challenge-help`}
              className="w-full sm:w-56"
              data-testid="challenge-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHALLENGES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHALLENGE_COPY[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHelp id={`${id}-challenge-help`}>{CHALLENGE_COPY[form.challenge].help}</FieldHelp>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-planned`}>Planned for (optional)</Label>
          <Input
            id={`${id}-planned`}
            type="datetime-local"
            // Local time: the server renders it in its own zone.
            suppressHydrationWarning
            value={form.plannedFor}
            disabled={pending}
            onChange={(e) => update({ plannedFor: e.target.value })}
            aria-describedby={`${id}-planned-help`}
            className="w-full sm:w-56"
          />
          <FieldHelp id={`${id}-planned-help`}>Shown on the room page. The session does not start by itself.</FieldHelp>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor={`${id}-avoid`} id={`${id}-avoid-l`} className="cursor-pointer">
            Avoid problems someone has already solved
          </Label>
          <FieldHelp id={`${id}-avoid-h`} className="mt-1">
            Prefers problems nobody in the session has solved before, inside or outside this room.
          </FieldHelp>
        </div>
        <Switch
          id={`${id}-avoid`}
          checked={form.avoidSolved}
          disabled={pending}
          onCheckedChange={(v) => update({ avoidSolved: v })}
          aria-labelledby={`${id}-avoid-l`}
          aria-describedby={`${id}-avoid-h`}
          className="mt-0.5"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" loading={pending} disabled={!dirty || mixProblem !== null} data-testid="apply-settings">
          <DicesIcon aria-hidden />
          Apply and draw
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setForm(formFromLobby(lobby))}>
            Discard changes
          </Button>
        )}
        {!dirty && <span className="text-sm text-muted-foreground">No unsaved changes</span>}
      </div>
    </form>
  );
}
