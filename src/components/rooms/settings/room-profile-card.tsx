"use client";

// Settings → Room profile (Rooms v2 §2.4 Settings, §11 POST …/profile):
// name, description, color. The owner edits; members see them read-only.
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { issuesToFieldErrors, type FieldErrors } from "@/lib/rooms/preset-form";
import { roomColor } from "@/lib/rooms/room-colors";
import { ROOM_DESCRIPTION_MAX, roomProfileBodySchema } from "@/lib/rooms/room-defaults";
import { ROOM_NAME_MAX } from "@/lib/rooms/schemas";

import { RoomColorPicker, RoomTile } from "../room-color";
import { useRoomAction } from "../use-room-action";

export function RoomProfileCard({
  roomId,
  name,
  description,
  color,
  canEdit,
}: {
  roomId: string;
  name: string;
  description: string | null;
  color: number;
  canEdit: boolean;
}) {
  const id = useId();
  const [form, setForm] = useState({ name, description: description ?? "", color });
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending } = useRoomAction();
  const dirty = form.name.trim() !== name || form.description.trim() !== (description ?? "") || form.color !== color;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...(form.name.trim() !== name ? { name: form.name } : {}),
      ...(form.description.trim() !== (description ?? "") ? { description: form.description.trim() || null } : {}),
      ...(form.color !== color ? { color: form.color } : {}),
    };
    const parsed = roomProfileBodySchema.safeParse(body);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    const res = await run(`/api/rooms/${roomId}/profile`, parsed.data, { success: "Room profile saved", toastErrors: false });
    if (!res.ok) setErrors(res.fieldErrors ?? { form: res.error });
  }

  return (
    <Card data-testid="room-profile-card">
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Room profile</h2>
        <CardDescription>
          {canEdit ? "Name, description and color, shown to members on the room page and the rooms list." : "Only the owner can change these."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Field>
              <Label htmlFor={`${id}-name`}>Room name</Label>
              <Input
                id={`${id}-name`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={ROOM_NAME_MAX * 2}
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `${id}-name-e` : undefined}
              />
              {errors.name && <FieldError id={`${id}-name-e`}>{errors.name}</FieldError>}
            </Field>
            <Field>
              <Label htmlFor={`${id}-desc`}>Description (optional)</Label>
              <Textarea
                id={`${id}-desc`}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="min-h-20"
                maxLength={ROOM_DESCRIPTION_MAX * 2}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={errors.description ? `${id}-desc-e` : `${id}-desc-h`}
              />
              {errors.description ? (
                <FieldError id={`${id}-desc-e`}>{errors.description}</FieldError>
              ) : (
                <FieldHelp id={`${id}-desc-h`}>Up to {ROOM_DESCRIPTION_MAX} characters.</FieldHelp>
              )}
            </Field>
            <RoomColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} disabled={pending} />
            {errors.color && <FieldError>{errors.color}</FieldError>}
            {errors.form && <FieldError>{errors.form}</FieldError>}
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" loading={pending} disabled={!dirty} data-testid="save-profile">
                Save profile
              </Button>
              {!dirty && <span className="text-sm text-muted-foreground">No unsaved changes</span>}
            </div>
          </form>
        ) : (
          <div className="flex items-start gap-3 text-sm">
            <RoomTile name={name} color={color} size="sm" />
            <dl className="flex min-w-0 flex-col gap-2">
              <div>
                <dt className="sr-only">Name</dt>
                <dd className="font-semibold break-words">{name}</dd>
              </div>
              <div>
                <dt className="sr-only">Color</dt>
                <dd className="text-muted-foreground">{roomColor(color).name}</dd>
              </div>
              <div>
                <dt className="font-semibold">Description</dt>
                <dd className="mt-0.5 break-words text-foreground-secondary">{description || "No description"}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
