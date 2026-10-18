"use client";

// Settings → Weekly schedule (Rooms v2 §5, §11 POST …/schedule): switch,
// weekday, 24-hour time, time zone (default: the owner's browser zone) and
// the preset. "Shows the next session on the room page. It never starts by
// itself." Members see it read-only. Messages come from the Zod schema.
import { useEffect, useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  presetSummary,
  sameSchedule,
  scheduleToForm,
  validateScheduleForm,
  WEEKDAY_OPTIONS,
  type FieldErrors,
  type ScheduleForm,
} from "@/lib/rooms/preset-form";
import type { RoomSchedule, SessionTemplate } from "@/lib/rooms/room-defaults";
import { localTimeZone, scheduleSummary, timeZoneOptions } from "@/lib/rooms/schedule";

import { useRoomAction } from "../use-room-action";
import { NativeSelect } from "./native-select";
import { SwitchRow } from "./switch-row";

export function ScheduleCard({
  roomId,
  schedule,
  presets,
  defaultPresetId,
  canEdit,
}: {
  roomId: string;
  schedule: RoomSchedule | null;
  presets: SessionTemplate[];
  defaultPresetId: string;
  canEdit: boolean;
}) {
  const id = useId();
  // The server renders with UTC; the browser zone is filled in after hydration.
  const [form, setForm] = useState<ScheduleForm>(() => scheduleToForm(schedule, "UTC"));
  // Server and browser ICU lists differ: render only the stored zone until hydrated.
  const [zones, setZones] = useState<string[]>(() => [...new Set([form.timeZone, "UTC"])]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending } = useRoomAction();
  useEffect(() => {
    const zone = localTimeZone();
    // The browser zone exists only on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZones(timeZoneOptions([zone, schedule?.timeZone ?? zone]));
    if (!schedule) setForm((f) => (f.enabled ? f : { ...f, timeZone: zone }));
  }, [schedule]);
  const update = (patch: Partial<ScheduleForm>) => setForm((f) => ({ ...f, ...patch }));
  const result = validateScheduleForm(form);
  const dirty = !result.ok || !sameSchedule(result.body.schedule, schedule);
  const defaultName = presets.find((p) => p.id === defaultPresetId)?.name ?? "Default";
  const presetOf = (pid: string | null) => presets.find((p) => p.id === pid) ?? presets.find((p) => p.id === defaultPresetId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateScheduleForm(form);
    if (!v.ok) {
      setErrors(v.fieldErrors);
      return;
    }
    setErrors({});
    const res = await run(`/api/rooms/${roomId}/schedule`, v.body, {
      success: v.body.schedule ? "Weekly schedule saved" : "Weekly schedule turned off",
      toastErrors: false,
    });
    if (!res.ok) setErrors(res.fieldErrors ?? { form: res.error });
  }

  return (
    <Card id="schedule" className="scroll-mt-24" data-testid="schedule-card">
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Weekly schedule</h2>
        <CardDescription>Shows the next session on the room page. It never starts by itself.</CardDescription>
      </CardHeader>
      <CardContent>
        {!canEdit ? (
          <p className="text-sm text-foreground-secondary">
            {schedule ? (
              <>
                {scheduleSummary(schedule)} · preset “{presetOf(schedule.presetId)?.name ?? defaultName}”
              </>
            ) : (
              "No weekly schedule yet. Ask the owner to set one."
            )}
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <SwitchRow
              label="Meet every week"
              help="Members see the next date and can add it to their calendar."
              checked={form.enabled}
              onChange={(v) => update({ enabled: v })}
              disabled={pending}
              testId="schedule-enabled"
            />
            {form.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-day`}>Weekday</Label>
                  <NativeSelect
                    id={`${id}-day`}
                    value={String(form.weekday)}
                    onChange={(e) => update({ weekday: Number(e.target.value) })}
                    aria-invalid={errors.weekday ? true : undefined}
                    data-testid="schedule-weekday"
                  >
                    {WEEKDAY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </NativeSelect>
                  {errors.weekday && <FieldError>{errors.weekday}</FieldError>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-time`}>Time (24-hour)</Label>
                  <Input
                    id={`${id}-time`}
                    type="time"
                    step={300}
                    value={form.time}
                    onChange={(e) => update({ time: e.target.value })}
                    aria-invalid={errors.time ? true : undefined}
                    aria-describedby={errors.time ? `${id}-time-e` : undefined}
                    data-testid="schedule-time"
                  />
                  {errors.time && <FieldError id={`${id}-time-e`}>{errors.time}</FieldError>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-tz`}>Time zone</Label>
                  <NativeSelect
                    id={`${id}-tz`}
                    value={form.timeZone}
                    onChange={(e) => update({ timeZone: e.target.value })}
                    aria-invalid={errors.timeZone ? true : undefined}
                    data-testid="schedule-zone"
                  >
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </NativeSelect>
                  {errors.timeZone && <FieldError>{errors.timeZone}</FieldError>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-preset`}>Preset</Label>
                  <NativeSelect
                    id={`${id}-preset`}
                    value={form.presetId}
                    onChange={(e) => update({ presetId: e.target.value })}
                    aria-invalid={errors.presetId ? true : undefined}
                    data-testid="schedule-preset"
                  >
                    <option value="">Room default (“{defaultName}”)</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {presetSummary(p)}
                      </option>
                    ))}
                  </NativeSelect>
                  {errors.presetId && <FieldError>{errors.presetId}</FieldError>}
                </div>
              </div>
            )}
            {errors.form && <FieldError>{errors.form}</FieldError>}
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" loading={pending} disabled={!dirty} data-testid="save-schedule">
                Save schedule
              </Button>
              {!dirty && <span className="text-sm text-muted-foreground">No unsaved changes</span>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
