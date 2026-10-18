"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROOM_DESCRIPTION_MAX, roomDescriptionSchema } from "@/lib/rooms/room-defaults";
import { ROOM_NAME_MAX, roomNameSchema } from "@/lib/rooms/schemas";

import { RoomColorPicker } from "./room-color";
import { postJson } from "./room-api";

/**
 * "Create a team room" button + dialog (Rooms v2 §2.5, §10): name, optional
 * description and a color; opens the room on success.
 */
export function CreateRoomDialog({ variant = "default" }: { variant?: "default" | "secondary" }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [color, setColor] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("name") ?? "");
    const rawDescription = String(form.get("description") ?? "");
    const parsed = roomNameSchema.safeParse(raw);
    const description = roomDescriptionSchema.safeParse(rawDescription);
    setFormError(null);
    setFieldError(parsed.success ? null : (parsed.error.issues[0]?.message ?? "Enter a room name"));
    setDescriptionError(description.success ? null : (description.error.issues[0]?.message ?? "Check the description"));
    if (!parsed.success || !description.success) return;
    setPending(true);
    const res = await postJson<{ id: string }>("/api/rooms", {
      name: parsed.data,
      ...(description.data ? { description: description.data } : {}),
      color,
    });
    if (res.ok) {
      toast.success(`Room "${parsed.data}" created`, { description: "Invite your friends with a link." });
      router.push(`/rooms/${res.data.id}?tab=settings`);
      return; // stay disabled while navigating
    }
    setPending(false);
    if (res.fieldErrors?.name) setFieldError(res.fieldErrors.name);
    else if (res.fieldErrors?.description) setDescriptionError(res.fieldErrors.description);
    else setFormError(res.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFieldError(null);
          setDescriptionError(null);
          setFormError(null);
          setColor(0);
        }
      }}
    >
      <DialogTrigger render={<Button variant={variant} />}>
        <PlusIcon aria-hidden />
        Create a team room
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a team room</DialogTitle>
          <DialogDescription>
            A room is your team: its own members, invite link, weekly sessions and history. Other teams never see it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && (
            <Alert variant="danger" role="alert">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}
          <fieldset disabled={pending} className="flex flex-col gap-4">
            <Field>
              <Label htmlFor={`${id}-name`}>Room name</Label>
              <Input
                id={`${id}-name`}
                name="name"
                autoComplete="off"
                maxLength={ROOM_NAME_MAX * 2}
                placeholder="Saturday Algo Club"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${id}-error` : `${id}-hint`}
                autoFocus
              />
              {fieldError ? (
                <FieldError id={`${id}-error`}>{fieldError}</FieldError>
              ) : (
                <FieldHelp id={`${id}-hint`}>Up to {ROOM_NAME_MAX} characters. You can rename it later.</FieldHelp>
              )}
            </Field>
            <Field>
              <Label htmlFor={`${id}-description`}>Description (optional)</Label>
              <Textarea
                id={`${id}-description`}
                name="description"
                rows={2}
                maxLength={ROOM_DESCRIPTION_MAX * 2}
                placeholder="Weekly practice with friends"
                className="min-h-20"
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby={descriptionError ? `${id}-description-error` : `${id}-description-hint`}
              />
              {descriptionError ? (
                <FieldError id={`${id}-description-error`}>{descriptionError}</FieldError>
              ) : (
                <FieldHelp id={`${id}-description-hint`}>Up to {ROOM_DESCRIPTION_MAX} characters. Members see it on the room page.</FieldHelp>
              )}
            </Field>
            <RoomColorPicker value={color} onChange={setColor} disabled={pending} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
              <Button type="submit" loading={pending}>
                {pending ? "Creating…" : "Create room"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
