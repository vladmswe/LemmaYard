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
import { ROOM_NAME_MAX, roomNameSchema } from "@/lib/rooms/schemas";

import { postJson } from "./room-api";

/** "New room" button + dialog with the name field; opens the room on success. */
export function CreateRoomDialog({ variant = "default" }: { variant?: "default" | "secondary" }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("name") ?? "");
    const parsed = roomNameSchema.safeParse(raw);
    setFormError(null);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a room name");
      return;
    }
    setFieldError(null);
    setPending(true);
    const res = await postJson<{ id: string }>("/api/rooms", { name: parsed.data });
    if (res.ok) {
      toast.success(`Room "${parsed.data}" created`, { description: "Invite your friends with a link." });
      router.push(`/rooms/${res.data.id}?tab=members`);
      return; // stay disabled while navigating
    }
    setPending(false);
    if (res.fieldErrors?.name) setFieldError(res.fieldErrors.name);
    else setFormError(res.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFieldError(null);
          setFormError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant={variant} />}>
        <PlusIcon aria-hidden />
        New room
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New room</DialogTitle>
          <DialogDescription>
            A private room for you and your friends. Only members can see it.
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
