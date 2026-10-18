"use client";

// Lobby Setup card of the host (docs/specs/rooms.md §2.1, §7.4; Rooms v2
// §2.3): preset tiles (room default first, "+ Save current as preset") →
// Problems stepper ("about 22 min per problem") → Duration 45/60/90/120/
// Other… → Pick problems By rating | By difficulty | I'll pick them →
// Challenge with its target share → Topics → (difficulty mode) the v1
// Suggested / Custom mix → Avoid solved → Rated session → Planned for →
// Apply and draw. Only changed fields are sent; a change of count, topics,
// mix, challenge or mode re-draws the unpinned slots.
import { DicesIcon, PlusIcon } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { AUTO_PICK_LABEL, autoPickHelp, LEETCODE_ATTRIBUTION } from "@/lib/leetcode/labels";
import { EXTERNAL_UNRATED_HELP } from "@/lib/rooms/external";
import { DIFFICULTY_LABEL, formFromLobby, mixError, settingsDiff, type LobbyForm } from "@/lib/rooms/lobby-copy";
import {
  applyPresetToLobby,
  lobbyMatchesPreset,
  minutesPerProblem,
  presetFormFromLobby,
  presetSummary,
  ratedHelp,
} from "@/lib/rooms/preset-form";
import { MAX_PRESETS, type SessionTemplate } from "@/lib/rooms/room-defaults";
import type { SessionSettingsBody } from "@/lib/rooms/session-schemas";
import type { LobbyView } from "@/lib/rooms/session-view";
import { DIFFICULTIES, MAX_PROBLEM_COUNT, MIN_PROBLEM_COUNT } from "@/lib/rooms/types";
import type { SessionTag } from "@/server/rooms/session-page";

import { PresetEditorDialog } from "../settings/presets-card";
import { ChallengeField, DurationField, ModeField, TopicsField } from "../settings/session-fields";
import { SwitchRow } from "../settings/switch-row";
import { useRoomAction } from "../use-room-action";
import { Stepper } from "./stepper";

export function SessionSettingsForm({
  roomId,
  lobby,
  tags,
  pending,
  onApply,
  onClean,
  presets,
  defaultPresetId,
  canSavePresets,
  onPresetsChanged,
}: {
  roomId: string;
  lobby: LobbyView;
  tags: SessionTag[];
  pending: boolean;
  onApply: (body: SessionSettingsBody) => Promise<boolean>;
  /** Called when the form matches the saved settings again (e.g. after a failed draw is undone). */
  onClean?: () => void;
  /** The room's presets (null while loading). */
  presets: SessionTemplate[] | null;
  defaultPresetId: string | null;
  /** Owner only: presets are owner-only (§4 recommendation, V2-1 API). */
  canSavePresets: boolean;
  onPresetsChanged: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState<LobbyForm>(() => formFromLobby(lobby));
  const [base, setBase] = useState(lobby);
  const [saveDialog, setSaveDialog] = useState<null | { makeDefault: boolean }>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const { run, pending: savingDefault } = useRoomAction();
  // A new lobby view from the server (own or another manager's change) resets the form.
  if (base !== lobby) {
    setBase(lobby);
    setForm(formFromLobby(lobby));
  }
  const update = (patch: Partial<LobbyForm>) => setForm((f) => ({ ...f, ...patch }));
  const diff = settingsDiff(lobby, form);
  const dirty = Object.keys(diff).length > 0;
  const mixProblem = form.mode === "difficulty" || form.external > form.problemCount ? mixError(form) : null;
  useEffect(() => {
    if (!dirty) onClean?.();
  }, [dirty, onClean]);

  const ordered = presets
    ? [...presets].sort((a, b) => Number(b.id === defaultPresetId) - Number(a.id === defaultPresetId))
    : [];
  // Two presets can hold the same fields: prefer the one the session started from (or was last picked).
  const matching = ordered.filter((p) => lobbyMatchesPreset(form, p));
  const selected = matching.find((p) => p.id === (picked ?? lobby.settings.presetId)) ?? matching[0] ?? null;
  const defaultPreset = ordered.find((p) => p.id === defaultPresetId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || mixProblem) return;
    await onApply(diff);
  }

  async function saveAsDefault() {
    // The form shows an existing preset: make it the default instead of adding a copy.
    if (selected) {
      if (selected.id === defaultPresetId) {
        toast.info(`“${selected.name}” is already the room default`);
        return;
      }
      const res = await run(`/api/rooms/${roomId}/presets`, { action: "default", id: selected.id }, {
        success: `“${selected.name}” is now the room default`,
        refresh: false,
      });
      if (res.ok) onPresetsChanged();
      return;
    }
    setSaveDialog({ makeDefault: true });
  }

  return (
    <>
    <form onSubmit={submit} aria-labelledby={`${id}-title`} className="flex flex-col gap-6" data-testid="session-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`${id}-title`} className="text-xl/7 font-semibold">
          Setup
        </h2>
        {canSavePresets && presets && (
          <Button
            type="button"
            variant="link"
            size="sm"
            loading={savingDefault}
            onClick={saveAsDefault}
            data-testid="save-as-default"
          >
            Save as room default
          </Button>
        )}
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-col gap-2">
          <span id={`${id}-presets`} className="text-sm font-semibold text-foreground">
            Preset
          </span>
          <div role="radiogroup" aria-labelledby={`${id}-presets`} className="grid gap-2 sm:grid-cols-2" data-testid="preset-tiles">
            {ordered.map((p) => {
              const on = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={pending}
                  onClick={() => {
                    setPicked(p.id);
                    setForm((f) => applyPresetToLobby(f, p));
                  }}
                  className={cn(
                    "flex min-w-0 flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                    on ? "border-primary bg-secondary text-secondary-foreground" : "border-border-strong bg-card hover:border-foreground-secondary",
                  )}
                  data-testid={`preset-tile-${p.name}`}
                >
                  <span className="font-semibold break-words">
                    {p.name}
                    {p.id === defaultPresetId && <span className="sr-only"> (room default)</span>}
                  </span>
                  <span className={cn("font-mono text-[0.8125rem]", on ? "text-secondary-foreground" : "text-muted-foreground")}>
                    {presetSummary(p)}
                  </span>
                </button>
              );
            })}
            {canSavePresets && presets.length < MAX_PRESETS && (
              <button
                type="button"
                onClick={() => setSaveDialog({ makeDefault: false })}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm font-semibold text-link hover:border-foreground-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                data-testid="save-current-preset"
              >
                <PlusIcon aria-hidden className="size-4" />
                Save current as preset
              </button>
            )}
          </div>
          <FieldHelp>
            {selected
              ? `“${selected.name}”${selected.id === defaultPresetId ? " is this room's default: new sessions start with it." : " is selected."} Changing a field below makes it “Custom” for this session only.`
              : `Custom settings for this session only${defaultPreset ? ` (room default: “${defaultPreset.name}”)` : ""}.`}
          </FieldHelp>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Stepper
            label="Problems"
            unit="problems"
            value={form.problemCount}
            min={MIN_PROBLEM_COUNT}
            max={MAX_PROBLEM_COUNT}
            disabled={pending}
            onChange={(v) => update({ problemCount: v })}
          />
          <FieldHelp>
            {MIN_PROBLEM_COUNT}–{MAX_PROBLEM_COUNT} · {minutesPerProblem(form.durationMin, form.problemCount)}
            {form.external > 0 && ` · ${form.external} from LeetCode, ${form.problemCount - form.external} drawn`}
          </FieldHelp>
          {form.external > form.problemCount && <FieldError>{mixError(form)}</FieldError>}
        </div>
        <DurationField value={form.durationMin} onChange={(v) => update({ durationMin: v })} disabled={pending} />
      </div>

      <ModeField
        value={form.mode}
        disabled={pending}
        onChange={(mode) =>
          // Rating / manual mode ignore the mix: going there resets a custom mix to "suggested".
          update(mode === "difficulty" ? { mode } : { mode, mixMode: "suggested", mix: lobby.settings.mix })
        }
      />

      {form.mode !== "manual" && (
        <ChallengeField
          mode={form.mode}
          value={form.challenge}
          problemCount={form.problemCount}
          onChange={(v) => update({ challenge: v })}
          disabled={pending}
        />
      )}

      {form.mode === "difficulty" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-sm font-semibold text-foreground">Difficulty</legend>
          <Segmented
            label="Difficulty mix"
            value={form.mixMode}
            onValueChange={(v) => {
              if (pending) return;
              update(
                v === "manual" && form.mixMode !== "manual"
                  ? { mixMode: v, mix: lobby.calibration?.suggested ?? lobby.actualMix }
                  : { mixMode: v },
              );
            }}
            options={[
              { value: "suggested", label: "Suggested" },
              { value: "manual", label: "Custom mix" },
            ]}
            className="self-start"
          />
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
      )}

      <TopicsField tags={tags} value={form.tags} onChange={(v) => update({ tags: v })} disabled={pending} />

      <fieldset className="flex flex-col gap-4 border-t pt-5" data-testid="leetcode-settings">
        <legend className="sr-only">LeetCode problems</legend>
        <div className="flex flex-col gap-1.5" data-testid="leetcode-count">
          <Stepper
            label="LeetCode problems"
            unit="LeetCode problems"
            value={form.external}
            min={0}
            max={form.problemCount}
            disabled={pending}
            onChange={(v) => update({ external: v, ...(v === 0 ? { leetcodeAuto: false } : {}) })}
          />
          <FieldHelp>
            {form.external === 0
              ? "None. A LeetCode problem is a link to leetcode.com that people mark solved themselves; it never changes ratings."
              : `The last ${form.external === 1 ? "slot is a LeetCode problem" : `${form.external} slots are LeetCode problems`}: a link to leetcode.com, marked solved by each person. Never rated.`}
          </FieldHelp>
        </div>
        {lobby.leetcodeCatalog && (
          <SwitchRow
            label={AUTO_PICK_LABEL}
            help={`${autoPickHelp(lobby.leetcodeCatalog.problems)} ${LEETCODE_ATTRIBUTION}.`}
            checked={form.leetcodeAuto}
            onChange={(v) => update({ leetcodeAuto: v })}
            disabled={pending || form.external === 0}
            testId="leetcode-auto-switch"
          />
        )}
      </fieldset>

      <div className="flex flex-col gap-5 border-t pt-5">
        <SwitchRow
          label="Avoid problems someone has already solved"
          help="Prefers problems nobody in the session has solved before, inside or outside this room."
          checked={form.avoidSolved}
          onChange={(v) => update({ avoidSolved: v })}
          disabled={pending}
        />
        <SwitchRow
          label="Rated session"
          help={
            form.external > 0
              ? `${ratedHelp(form.durationMin, form.problemCount)} ${EXTERNAL_UNRATED_HELP}`
              : ratedHelp(form.durationMin, form.problemCount)
          }
          checked={form.rated}
          onChange={(v) => update({ rated: v })}
          disabled={pending}
          testId="rated-switch"
        />
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
            className="w-full sm:w-64"
          />
          <FieldHelp id={`${id}-planned-help`}>Shown on the room page. The session does not start by itself.</FieldHelp>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" loading={pending} disabled={!dirty || mixProblem !== null} data-testid="apply-settings">
          <DicesIcon aria-hidden />
          {form.mode === "manual" ? "Apply" : "Apply and draw"}
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setForm(formFromLobby(lobby))}>
            Discard changes
          </Button>
        )}
        {!dirty && <span className="text-sm text-muted-foreground">No unsaved changes</span>}
      </div>
    </form>
    {/* Outside the form: React events bubble through portals, so a nested submit would reach `submit`. */}
      {saveDialog && (
        <PresetEditorDialog
          roomId={roomId}
          initial={presetFormFromLobby(form, saveDialog.makeDefault && selected ? selected.name : "")}
          tags={tags}
          isDefault={false}
          leetcodeCatalogSize={lobby.leetcodeCatalog?.problems ?? null}
          makeDefaultInitial={saveDialog.makeDefault}
          title={saveDialog.makeDefault ? "Save as room default" : "Save current as preset"}
          onClose={() => setSaveDialog(null)}
          onSaved={onPresetsChanged}
        />
      )}
    </>
  );
}
