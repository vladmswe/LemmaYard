"use client";

// Settings → Session presets (Rooms v2 §4, §11 POST …/presets): up to 5
// named settings ("Saturday · 90 min · 4 problems · by rating ·
// balanced"). The owner adds, edits, deletes and picks the default; members
// see the list read-only. A new session starts from the default preset.
import { PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  emptyPresetForm,
  minutesPerProblem,
  presetSummary,
  presetToForm,
  ratedHelp,
  validatePresetForm,
  type FieldErrors,
  type PresetForm,
} from "@/lib/rooms/preset-form";
import { MAX_PRESETS, PRESET_NAME_MAX, type SessionTemplate } from "@/lib/rooms/room-defaults";
import { DIFFICULTY_LABEL } from "@/lib/rooms/lobby-copy";
import { DIFFICULTIES, MAX_PROBLEM_COUNT, MIN_PROBLEM_COUNT, mixTotal } from "@/lib/rooms/types";

import { AUTO_PICK_LABEL, autoPickHelp, LEETCODE_ATTRIBUTION } from "@/lib/leetcode/labels";

import { Stepper } from "../lobby/stepper";
import { useRoomAction } from "../use-room-action";
import { ChallengeField, DurationField, ModeField, TopicsField } from "./session-fields";
import { SwitchRow } from "./switch-row";

type Tag = { slug: string; name: string; count: number };

export function PresetsCard({
  roomId,
  presets,
  defaultPresetId,
  canEdit,
  tags,
  leetcodeCatalogSize = null,
}: {
  roomId: string;
  presets: SessionTemplate[];
  defaultPresetId: string;
  canEdit: boolean;
  tags: Tag[];
  /** LeetCode catalog size; null hides the auto-pick switch (catalog off or invalid). */
  leetcodeCatalogSize?: number | null;
}) {
  const [editing, setEditing] = useState<PresetForm | null>(null);
  const [deleting, setDeleting] = useState<SessionTemplate | null>(null);
  const { run, pending } = useRoomAction();
  const full = presets.length >= MAX_PRESETS;
  const tagName = new Map(tags.map((t) => [t.slug, t.name]));

  async function makeDefault(id: string) {
    await run(`/api/rooms/${roomId}/presets`, { action: "default", id }, { success: "Default preset changed" });
  }
  async function remove() {
    if (!deleting) return;
    const res = await run(`/api/rooms/${roomId}/presets`, { action: "delete", id: deleting.id }, { success: `Preset “${deleting.name}” deleted` });
    if (res.ok) setDeleting(null);
  }

  return (
    <Card data-testid="presets-card">
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Session presets</h2>
        <CardDescription>
          New sessions start from the default preset; the lobby can switch to another one. Up to {MAX_PRESETS}.
          {!canEdit && " Only the owner can change them."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y rounded-lg border" data-testid="preset-list">
          {presets.map((p) => {
            const isDefault = p.id === defaultPresetId;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid={`preset-${p.name}`}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="break-words">{p.name}</span>
                    {isDefault && <Badge variant="secondary">Default</Badge>}
                    {!p.rated && <Badge variant="outline">Unrated</Badge>}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.8125rem] text-muted-foreground">{presetSummary(p)}</p>
                  {p.tags.length > 0 && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.tags.map((t) => tagName.get(t) ?? t).join(", ")}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {!isDefault && (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => makeDefault(p.id)}>
                        <StarIcon aria-hidden />
                        Make default<span className="sr-only">: {p.name}</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(presetToForm(p))}>
                      <PencilIcon aria-hidden />
                      Edit<span className="sr-only"> {p.name}</span>
                    </Button>
                    {presets.length > 1 && (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDeleting(p)}>
                        <Trash2Icon aria-hidden />
                        Delete<span className="sr-only"> {p.name}</span>
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={full || pending} onClick={() => setEditing(emptyPresetForm())} data-testid="add-preset">
              <PlusIcon aria-hidden />
              Add preset
            </Button>
            {full && <span className="text-sm text-muted-foreground">A room keeps at most {MAX_PRESETS} presets. Delete one first.</span>}
          </div>
        )}
      </CardContent>

      {editing && (
        <PresetEditorDialog
          roomId={roomId}
          initial={editing}
          tags={tags}
          isDefault={editing.id === defaultPresetId}
          leetcodeCatalogSize={leetcodeCatalogSize}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && !pending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Sessions already played keep their settings. A weekly schedule that used this preset switches to the default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <Button variant="destructive" loading={pending} onClick={remove} data-testid="confirm-delete-preset">
              Delete preset
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function PresetEditorDialog({
  roomId,
  initial,
  tags,
  isDefault,
  onClose,
  makeDefaultInitial = false,
  onSaved,
  title,
  leetcodeCatalogSize = null,
}: {
  roomId: string;
  initial: PresetForm;
  tags: Tag[];
  isDefault: boolean;
  leetcodeCatalogSize?: number | null;
  onClose: () => void;
  makeDefaultInitial?: boolean;
  /** After a successful save (the lobby re-reads the room's presets). */
  onSaved?: () => void;
  title?: string;
}) {
  const id = useId();
  const [form, setForm] = useState<PresetForm>(initial);
  const [makeDefault, setMakeDefault] = useState(makeDefaultInitial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending } = useRoomAction();
  const update = (patch: Partial<PresetForm>) => setForm((f) => ({ ...f, ...patch }));
  const isNew = !initial.id;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validatePresetForm(form);
    if (!v.ok) {
      setErrors(v.fieldErrors);
      return;
    }
    setErrors({});
    const res = await run(
      `/api/rooms/${roomId}/presets`,
      { action: "save", preset: v.preset, ...(makeDefault ? { makeDefault: true } : {}) },
      { success: isNew ? `Preset “${v.preset.name}” added` : `Preset “${v.preset.name}” saved`, toastErrors: false },
    );
    if (res.ok) {
      onSaved?.();
      onClose();
    } else setErrors(res.fieldErrors ?? { form: res.error });
  }

  const mixSum = mixTotal(form.mix);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ?? (isNew ? "Add a preset" : `Edit “${initial.name}”`)}</DialogTitle>
          <DialogDescription>A named starting point for new sessions in this room.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="preset-editor">
          <Field>
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              maxLength={PRESET_NAME_MAX * 2}
              placeholder="Saturday"
              autoComplete="off"
              autoFocus
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${id}-name-e` : `${id}-name-h`}
            />
            {errors.name ? (
              <FieldError id={`${id}-name-e`}>{errors.name}</FieldError>
            ) : (
              <FieldHelp id={`${id}-name-h`}>Up to {PRESET_NAME_MAX} characters, e.g. “Saturday” or “Short”.</FieldHelp>
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <Stepper
              label="Problems"
              unit="problems"
              value={form.problemCount}
              min={MIN_PROBLEM_COUNT}
              max={MAX_PROBLEM_COUNT}
              disabled={pending}
              onChange={(v) => update({ problemCount: v, external: Math.min(form.external, v) })}
            />
            <FieldHelp>
              {MIN_PROBLEM_COUNT}–{MAX_PROBLEM_COUNT} · {minutesPerProblem(form.durationMin, form.problemCount)}
            </FieldHelp>
            {errors.problemCount && <FieldError>{errors.problemCount}</FieldError>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Stepper
              label="From LeetCode"
              unit="LeetCode problems"
              value={form.external}
              min={0}
              max={form.problemCount}
              disabled={pending}
              onChange={(v) => update({ external: v, ...(v === 0 ? { leetcodeAuto: false } : {}) })}
            />
            <FieldHelp>
              {form.leetcodeAuto && form.external > 0
                ? "Filled automatically when the lobby draws. They are self-reported and never change ratings."
                : "Slots the host fills with LeetCode links in the lobby. They are self-reported and never change ratings."}
            </FieldHelp>
            {errors.external && <FieldError>{errors.external}</FieldError>}
          </div>
          {leetcodeCatalogSize !== null && (
            <SwitchRow
              label={AUTO_PICK_LABEL}
              help={`${autoPickHelp(leetcodeCatalogSize)} ${LEETCODE_ATTRIBUTION}.`}
              checked={form.leetcodeAuto && form.external > 0}
              onChange={(v) => update({ leetcodeAuto: v })}
              disabled={pending || form.external === 0}
              testId="preset-leetcode-auto"
            />
          )}
          <DurationField value={form.durationMin} onChange={(v) => update({ durationMin: v })} disabled={pending} />
          {errors.durationMin && <FieldError>{errors.durationMin}</FieldError>}
          <ModeField value={form.mode} onChange={(v) => update({ mode: v })} disabled={pending} />
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
            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold">Difficulty mix</span>
              <Segmented
                label="Difficulty mix"
                value={form.mixMode}
                onValueChange={(v) => update({ mixMode: v })}
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
                      onChange={(v) => update({ mix: { ...form.mix, [d]: v } })}
                    />
                  ))}
                </div>
              )}
              {form.mixMode === "manual" && mixSum !== form.problemCount - form.external && !errors.mix && (
                <FieldHelp>
                  The mix adds up to {mixSum}; it must add up to {form.problemCount - form.external}
                  {form.external > 0 ? ` (${form.external} more from LeetCode)` : ""}.
                </FieldHelp>
              )}
              {errors.mix && <FieldError>{errors.mix}</FieldError>}
            </div>
          )}
          <TopicsField tags={tags} value={form.tags} onChange={(v) => update({ tags: v })} disabled={pending} />
          {errors.tags && <FieldError>{errors.tags}</FieldError>}
          <div className="flex flex-col gap-4 border-t pt-4">
            <SwitchRow
              label="Avoid problems someone has already solved"
              help="Inside or outside this room."
              checked={form.avoidSolved}
              onChange={(v) => update({ avoidSolved: v })}
              disabled={pending}
            />
            <SwitchRow
              label="Rated session"
              help={ratedHelp(form.durationMin, form.problemCount)}
              checked={form.rated}
              onChange={(v) => update({ rated: v })}
              disabled={pending}
            />
            {!isDefault && (
              <SwitchRow
                label="Make it the room default"
                help="New sessions and the weekly schedule start with the default preset."
                checked={makeDefault}
                onChange={setMakeDefault}
                disabled={pending}
              />
            )}
          </div>
          {errors.form && <FieldError>{errors.form}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} data-testid="save-preset">
              {isNew ? "Add preset" : "Save preset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
