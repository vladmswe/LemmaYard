"use client";

// "Add LeetCode problem" in the lobby (docs/specs/rooms-external-problems.md
// §4): pick an entry of the room's LeetCode list, or paste a link (owner:
// optionally saved to the list). The server fills the first empty LeetCode
// slot or appends one; nothing is fetched from leetcode.com.
import { PlusIcon } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  emptyExternalForm,
  validateExternalForm,
  type BankEntry,
  type ExternalForm,
  type SessionExternalBody,
} from "@/lib/rooms/external";

import { ExternalProblemFields } from "../external/external-problem-fields";
import { LeetCodeLink } from "../external/leetcode-bits";
import { sessionApi } from "../live/session-api";

export function AddLeetCodeDialog({
  roomId,
  pending,
  canSaveToBank,
  inSession,
  onClose,
  onAdd,
}: {
  roomId: string;
  pending: boolean;
  /** The room owner may save a pasted link to the room's list. */
  canSaveToBank: boolean;
  /** LeetCode slugs already in the session. */
  inSession: ReadonlySet<string>;
  onClose: () => void;
  /** Sends the body; resolves true when the slot was added (the dialog closes). */
  onAdd: (body: SessionExternalBody) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const saveId = useId();
  const [bank, setBank] = useState<BankEntry[] | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "link">("list");
  const [form, setForm] = useState<ExternalForm>(emptyExternalForm());
  const [save, setSave] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void sessionApi.bank(roomId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setBank(res.data.problems);
        if (res.data.problems.length === 0) setTab("link");
      } else {
        setBankError(res.error);
        setTab("link");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function addFromBank(id: string) {
    const res = await onAdd({ action: "add", bankId: id });
    if (!res.ok) setBankError(res.error);
  }

  async function submitLink(e: FormEvent) {
    e.preventDefault();
    const v = validateExternalForm(form);
    if (!v.ok) {
      setErrors(v.fieldErrors);
      return;
    }
    setErrors({});
    const res = await onAdd({ action: "add", ...v.input, ...(canSaveToBank && save ? { saveToBank: true } : {}) });
    if (!res.ok) setErrors({ form: res.error });
  }

  const available = bank?.filter((b) => !inSession.has(b.slug)) ?? null;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" data-testid="add-leetcode-dialog">
        <DialogHeader>
          <DialogTitle>Add a LeetCode problem</DialogTitle>
          <DialogDescription>
            It joins the session as a link to leetcode.com. Participants mark it solved themselves; it never changes
            ratings. Others see its title when the session starts.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "link")} className="gap-4">
          <TabsList aria-label="Where from" className="w-full">
            <TabsTrigger value="list" className="h-10 flex-1">
              From the room list
            </TabsTrigger>
            <TabsTrigger value="link" className="h-10 flex-1">
              Paste a link
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="flex flex-col gap-3">
            {bankError && <FieldError>{bankError}</FieldError>}
            {available === null ? (
              !bankError && <p className="text-sm text-muted-foreground">Loading the room&apos;s list…</p>
            ) : available.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground" data-testid="bank-none">
                {bank && bank.length > 0
                  ? "Every problem of the room's list is already in this session."
                  : "The room's LeetCode list is empty. Paste a link instead, or ask the owner to add problems in Settings."}
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border" aria-label="The room's LeetCode problems">
                {available.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`pick-${b.slug}`}>
                    <span className="flex min-w-0 flex-col gap-1">
                      <LeetCodeLink slug={b.slug} className="truncate font-medium">
                        {b.title}
                      </LeetCodeLink>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {b.difficulty && <DifficultyBadge difficulty={b.difficulty} variant="text" className="text-xs" />}
                        {b.rating !== null && <span className="font-mono">rating {b.rating}</span>}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => addFromBank(b.id)}
                      data-testid={`add-bank-${b.slug}`}
                    >
                      <PlusIcon aria-hidden />
                      Add<span className="sr-only"> {b.title}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="link">
            <form onSubmit={submitLink} noValidate className="flex flex-col gap-5" data-testid="add-leetcode-link">
              <ExternalProblemFields
                form={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                errors={errors}
                disabled={pending}
              />
              {canSaveToBank && (
                <label htmlFor={saveId} className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    id={saveId}
                    checked={save}
                    onCheckedChange={(v) => setSave(v === true)}
                    disabled={pending}
                    data-testid="save-to-bank"
                  />
                  <span>Also save it to the room&apos;s LeetCode list</span>
                </label>
              )}
              {errors.form && <FieldError>{errors.form}</FieldError>}
              <DialogFooter>
                <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending} data-testid="add-leetcode-submit">
                  Add to the session
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
