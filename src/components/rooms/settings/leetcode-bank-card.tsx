"use client";

// Settings → LeetCode problems (docs/specs/rooms-external-problems.md §1.1,
// §3): the room's list of LeetCode links. The owner adds, edits and removes
// entries; members read it. Hosts pick from it in the lobby. Only the slug is
// stored; the link is built here and opens leetcode.com in a new tab.
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import {
  emptyExternalForm,
  externalFormFrom,
  MAX_BANK_ENTRIES,
  validateExternalForm,
  type BankEntry,
  type ExternalForm,
} from "@/lib/rooms/external";

import { ExternalProblemFields } from "../external/external-problem-fields";
import { LeetCodeLink } from "../external/leetcode-bits";
import { useRoomAction } from "../use-room-action";

type Editing = { id?: string; form: ExternalForm };

export function LeetCodeBankCard({ roomId, entries, canEdit }: { roomId: string; entries: BankEntry[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<BankEntry | null>(null);
  const { run, pending } = useRoomAction();
  const full = entries.length >= MAX_BANK_ENTRIES;

  async function remove() {
    if (!removing) return;
    const res = await run(
      `/api/rooms/${roomId}/external-problems`,
      { action: "delete", id: removing.id },
      { success: `“${removing.title}” removed from the list` },
    );
    if (res.ok) setRemoving(null);
  }

  return (
    <Card data-testid="leetcode-bank-card">
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">LeetCode problems</h2>
        <CardDescription>
          Links to problems on leetcode.com that hosts can add to a session. Our judge cannot check them: people open
          them in a new tab and mark them solved themselves. They never change ratings.
          {!canEdit && " Only the owner can change the list."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground" data-testid="bank-empty">
            No LeetCode problems yet.{canEdit ? " Add one with its link." : ""}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border" data-testid="bank-list">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid={`bank-entry-${e.slug}`}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2">
                    <LeetCodeLink slug={e.slug} className="font-semibold break-words">
                      {e.title}
                    </LeetCodeLink>
                    {e.difficulty && <DifficultyBadge difficulty={e.difficulty} />}
                    {e.rating !== null && (
                      <span
                        className="inline-flex h-6 items-center rounded-sm border border-border-strong px-1.5 font-mono text-xs tabular-nums text-foreground-secondary"
                        title="Rating entered by the owner (display only)"
                      >
                        <span className="sr-only">rating </span>
                        {e.rating}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.8125rem] break-all text-muted-foreground">{e.slug}</p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing({ id: e.id, form: externalFormFrom(e) })}>
                      <PencilIcon aria-hidden />
                      Edit<span className="sr-only"> {e.title}</span>
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRemoving(e)}>
                      <Trash2Icon aria-hidden />
                      Remove<span className="sr-only"> {e.title}</span>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={full || pending}
              onClick={() => setEditing({ form: emptyExternalForm() })}
              data-testid="add-bank-entry"
            >
              <PlusIcon aria-hidden />
              Add LeetCode problem
            </Button>
            {full && (
              <span className="text-sm text-muted-foreground">
                A room keeps at most {MAX_BANK_ENTRIES} LeetCode problems. Remove one first.
              </span>
            )}
          </div>
        )}
      </CardContent>

      {editing && <BankEntryDialog roomId={roomId} editing={editing} onClose={() => setEditing(null)} />}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !pending && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Sessions that already used it keep it in their results. Hosts can no longer pick it from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <Button variant="destructive" loading={pending} onClick={remove} data-testid="confirm-remove-bank-entry">
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function BankEntryDialog({ roomId, editing, onClose }: { roomId: string; editing: Editing; onClose: () => void }) {
  const [form, setForm] = useState<ExternalForm>(editing.form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending } = useRoomAction();
  const isNew = !editing.id;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateExternalForm(form);
    if (!v.ok) {
      setErrors(v.fieldErrors);
      return;
    }
    setErrors({});
    const body = isNew ? { action: "add", ...v.input } : { action: "update", id: editing.id, ...v.input };
    const res = await run(`/api/rooms/${roomId}/external-problems`, body, {
      success: isNew ? "LeetCode problem added" : "LeetCode problem saved",
      toastErrors: false,
    });
    if (res.ok) onClose();
    else setErrors(res.fieldErrors ? (res.fieldErrors as Record<string, string>) : { form: res.error });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a LeetCode problem" : "Edit LeetCode problem"}</DialogTitle>
          <DialogDescription>Hosts can add it to a session; results for it are self-reported.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="bank-entry-form">
          <ExternalProblemFields
            form={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            errors={errors}
            disabled={pending}
            autoFocus
          />
          {errors.form && <FieldError>{errors.form}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} data-testid="save-bank-entry">
              {isNew ? "Add problem" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
