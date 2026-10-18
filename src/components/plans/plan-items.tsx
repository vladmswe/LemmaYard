"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/format";
import { moveItem, moveSection, type Direction, type PlanLayout } from "@/lib/plans/layout";
import { isDone } from "@/lib/plans/progress";
import {
  EXTERNAL_TITLE_MAX,
  externalTitleSchema,
  ITEM_NOTE_MAX,
  itemNoteSchema,
  MAX_SECTIONS_PER_PLAN,
  SECTION_TITLE_MAX,
  sectionTitleSchema,
} from "@/lib/plans/schemas";
import type { PlanItemView, PlanSectionView } from "@/server/plans/read";

import { ItemMark, markKind } from "./item-mark";
import { sendJson } from "./plans-api";

type Props = {
  planId: string;
  /** Share token of an unlisted plan the viewer opened by link (tick calls send it). */
  share: string | null;
  isOwner: boolean;
  signedIn: boolean;
  unsectioned: PlanItemView[];
  sections: PlanSectionView[];
};

function layoutOf(unsectioned: PlanItemView[], sections: PlanSectionView[]): PlanLayout {
  return {
    unsectioned: unsectioned.map((i) => i.id),
    sections: sections.map((s) => ({ id: s.id, items: s.items.map((i) => i.id) })),
  };
}

function itemTitle(item: PlanItemView): string {
  return item.kind === "problem" ? item.problem.title : item.external.title;
}

/**
 * The plan's sections and items (mockup 06) with the viewer's status per item,
 * "Mark done" on LeetCode items, and for the owner an Edit mode: Move up /
 * Move down for items and sections (keyboard only is enough; focus stays on
 * the moved control), remove, notes, sections. Moves apply at once and are
 * saved in order (one request at a time); other changes refresh the page.
 */
export function PlanItems({ planId, share, isOwner, signedIn, unsectioned, sections }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const statusId = useId();
  const propsLayout = layoutOf(unsectioned, sections);
  const propsKey = JSON.stringify(propsLayout);
  const [layout, setLayout] = useState(propsLayout);
  const [syncedKey, setSyncedKey] = useState(propsKey);
  // Server data changed (refresh after a write): follow it (React's "adjust state on prop change").
  if (propsKey !== syncedKey) {
    setSyncedKey(propsKey);
    setLayout(propsLayout);
  }
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Control to focus after a move re-renders the list (set together with the layout).
  const focusTarget = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const items = new Map<string, PlanItemView>();
  for (const i of unsectioned) items.set(i.id, i);
  for (const s of sections) for (const i of s.items) items.set(i.id, i);
  const sectionTitles = new Map(sections.map((s) => [s.id, s.title]));

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const el = document.getElementById(target) as HTMLButtonElement | null;
    if (el && !el.disabled) el.focus();
    else {
      // The control at the edge is disabled now: focus its twin instead.
      const twin = target.endsWith("-up") ? target.replace(/-up$/, "-down") : target.replace(/-down$/, "-up");
      (document.getElementById(twin) as HTMLButtonElement | null)?.focus();
    }
  }, [layout]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function saveLayout(next: PlanLayout, previous: PlanLayout) {
    queue.current = queue.current.then(async () => {
      const res = await sendJson("PATCH", `/api/plans/${planId}/items`, next);
      if (!res.ok) {
        setLayout(previous);
        toast.error("Could not save the new order", { description: res.error });
        refresh();
      }
    });
  }

  function groupLabel(sectionId: string | null): string {
    return sectionId === null ? "the top list" : (sectionTitles.get(sectionId) ?? "a section");
  }

  function onMoveItem(itemId: string, direction: Direction) {
    const next = moveItem(layout, itemId, direction);
    if (!next) return;
    const previous = layout;
    setLayout(next);
    focusTarget.current = `${itemId}-${direction}`;
    const group = next.unsectioned.includes(itemId) ? null : next.sections.find((s) => s.items.includes(itemId))!.id;
    const position = (group === null ? next.unsectioned : next.sections.find((s) => s.id === group)!.items).indexOf(itemId) + 1;
    setAnnouncement(`${itemTitle(items.get(itemId)!)} moved to position ${position} in ${groupLabel(group)}`);
    saveLayout(next, previous);
  }

  function onMoveSection(sectionId: string, direction: Direction) {
    const next = moveSection(layout, sectionId, direction);
    if (!next) return;
    const previous = layout;
    setLayout(next);
    focusTarget.current = `${sectionId}-${direction}`;
    const position = next.sections.findIndex((s) => s.id === sectionId) + 1;
    setAnnouncement(`Section ${sectionTitles.get(sectionId)} moved to position ${position}`);
    saveLayout(next, previous);
  }

  async function onTick(item: PlanItemView, done: boolean) {
    setTicks((t) => ({ ...t, [item.id]: done }));
    const res = await sendJson("PUT", `/api/plans/${planId}/items/${item.id}/tick`, { done, ...(share ? { share } : {}) });
    if (!res.ok) {
      setTicks((t) => ({ ...t, [item.id]: !done }));
      toast.error("Could not save", { description: res.error });
      return;
    }
    refresh();
  }

  async function onRemove(item: PlanItemView) {
    const res = await sendJson("DELETE", `/api/plans/${planId}/items/${item.id}`);
    if (!res.ok) {
      toast.error("Could not remove the problem", { description: res.error });
      return;
    }
    toast.success(`Removed ${itemTitle(item)}`);
    refresh();
  }

  const effective = (item: PlanItemView): PlanItemView =>
    item.kind === "external" && ticks[item.id] !== undefined
      ? { ...item, state: { kind: "external", done: ticks[item.id] } }
      : item;

  // Only the very first item (top list) cannot move up and only the last item of the last section cannot move down.
  const first = layout.unsectioned[0];
  const lastGroup = layout.sections.length > 0 ? layout.sections[layout.sections.length - 1].items : layout.unsectioned;
  const last = lastGroup.at(-1);
  const total = items.size;
  const showTopHeading = layout.sections.length > 0;

  const renderGroup = (ids: string[], emptyText: string | null) =>
    ids.length === 0 ? (
      emptyText && <p className="px-5 py-4 text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <ol className="divide-y divide-border border-t border-border">
        {ids.map((id) => {
          const item = items.get(id);
          if (!item) return null;
          return (
            <ItemRow
              key={id}
              planId={planId}
              item={effective(item)}
              signedIn={signedIn}
              editing={editing}
              canUp={id !== first}
              canDown={id !== last}
              onMove={(d) => onMoveItem(id, d)}
              onTick={(done) => onTick(item, done)}
              onRemove={() => onRemove(item)}
              onEdited={refresh}
            />
          );
        })}
      </ol>
    );

  return (
    <div className="flex flex-col gap-5" data-testid="plan-items">
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {isOwner && (total > 0 || layout.sections.length > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant={editing ? "default" : "secondary"}
            size="sm"
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
            data-testid="edit-plan-toggle"
          >
            <PencilIcon aria-hidden />
            {editing ? "Done editing" : "Edit order and notes"}
          </Button>
        </div>
      )}

      {(layout.unsectioned.length > 0 || (editing && showTopHeading)) && (
        <section aria-labelledby={`${planId}-top`} className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <GroupHead
            id={`${planId}-top`}
            title={showTopHeading ? "Problems" : "All problems"}
            items={layout.unsectioned.map((id) => items.get(id)).filter((i): i is PlanItemView => Boolean(i)).map(effective)}
            signedIn={signedIn}
            srOnly={!showTopHeading}
          />
          {renderGroup(layout.unsectioned, editing ? "Move problems here with Move up." : null)}
        </section>
      )}

      {layout.sections.map((s, index) => (
        <section key={s.id} aria-labelledby={`${s.id}-title`} className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <GroupHead
            id={`${s.id}-title`}
            title={sectionTitles.get(s.id) ?? "Section"}
            items={s.items.map((id) => items.get(id)).filter((i): i is PlanItemView => Boolean(i)).map(effective)}
            signedIn={signedIn}
            actions={
              editing ? (
                <SectionControls
                  planId={planId}
                  sectionId={s.id}
                  title={sectionTitles.get(s.id) ?? ""}
                  canUp={index > 0}
                  canDown={index < layout.sections.length - 1}
                  onMove={(d) => onMoveSection(s.id, d)}
                  onChanged={refresh}
                />
              ) : null
            }
          />
          {renderGroup(s.items, "No problems in this section yet.")}
        </section>
      ))}

      {editing && <AddSection planId={planId} disabled={layout.sections.length >= MAX_SECTIONS_PER_PLAN} onAdded={refresh} />}
    </div>
  );
}

function GroupHead({
  id,
  title,
  items,
  signedIn,
  actions,
  srOnly = false,
}: {
  id: string;
  title: string;
  items: PlanItemView[];
  signedIn: boolean;
  actions?: ReactNode;
  srOnly?: boolean;
}) {
  const counted = items.filter((i) => i.state.kind !== "unavailable");
  const done = counted.filter((i) => isDone(i.state)).length;
  if (srOnly) {
    return (
      <h2 id={id} className="sr-only">
        {title}
      </h2>
    );
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4">
      <h2 id={id} className="min-w-0 font-display text-[1.75rem]/[1.1] break-words" dir="auto">
        {title}
      </h2>
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {signedIn ? `${done} of ${counted.length} done` : `${items.length} ${items.length === 1 ? "problem" : "problems"}`}
        </p>
        {actions}
      </div>
    </div>
  );
}

function IconButton({
  id,
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  id?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Button
      id={id}
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

function ItemRow({
  planId,
  item,
  signedIn,
  editing,
  canUp,
  canDown,
  onMove,
  onTick,
  onRemove,
  onEdited,
}: {
  planId: string;
  item: PlanItemView;
  signedIn: boolean;
  editing: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (direction: Direction) => void;
  onTick: (done: boolean) => void;
  onRemove: () => void;
  onEdited: () => void;
}) {
  const title = itemTitle(item);
  const kind = markKind(item.state);
  const s = item.state;
  let detail: string | null = null;
  if (s.kind === "problem" && s.status === "solved") detail = s.solvedAt ? `Solved ${formatShortDate(new Date(s.solvedAt))}` : "Solved";
  else if (s.kind === "problem" && s.status === "attempted")
    detail = s.wrongCount > 0 ? `Attempted · ${s.wrongCount} ${s.wrongCount === 1 ? "wrong answer" : "wrong answers"}` : "Attempted";
  else if (s.kind === "external") detail = s.done ? "Marked done" : signedIn ? "On LeetCode: mark it done yourself" : "On LeetCode";
  else if (s.kind === "unavailable") detail = "No longer available on LemmaYard";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5" data-testid="plan-item" data-item-id={item.id}>
      <ItemMark kind={kind} className="mt-0.5 self-start" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {item.kind === "problem" ? (
            item.problem.published ? (
              <Link href={`/problems/${item.problem.slug}`} className="font-semibold break-words text-foreground hover:text-link">
                {title}
              </Link>
            ) : (
              <span className="font-semibold break-words text-muted-foreground">{title}</span>
            )
          ) : (
            <a
              href={item.external.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold break-words text-foreground hover:text-link"
              dir="auto"
            >
              {title}
              <Badge variant="tag" className="h-5 gap-1 px-1.5 text-[0.6875rem]">
                LeetCode
                <ExternalLinkIcon aria-hidden className="size-3" />
              </Badge>
              <span className="sr-only">(opens leetcode.com in a new tab)</span>
            </a>
          )}
        </p>
        <p className="mt-0.5 text-[0.8125rem] break-words text-muted-foreground">
          {detail}
          {detail && item.note ? " · " : ""}
          {item.note && <span dir="auto">{item.note}</span>}
        </p>
      </div>
      {editing ? (
        <div className="ml-auto flex items-center gap-0.5" role="group" aria-label={`Edit ${title}`}>
          <IconButton id={`${item.id}-up`} label={`Move ${title} up`} disabled={!canUp} onClick={() => onMove("up")} testId="move-up">
            <ArrowUpIcon aria-hidden />
          </IconButton>
          <IconButton id={`${item.id}-down`} label={`Move ${title} down`} disabled={!canDown} onClick={() => onMove("down")} testId="move-down">
            <ArrowDownIcon aria-hidden />
          </IconButton>
          <ItemEditDialog planId={planId} item={item} onSaved={onEdited} />
          <IconButton label={`Remove ${title} from the plan`} onClick={onRemove} testId="remove-item">
            <Trash2Icon aria-hidden />
          </IconButton>
        </div>
      ) : item.kind === "external" ? (
        signedIn && (
          <Button
            variant={s.kind === "external" && s.done ? "secondary" : "ghost"}
            size="sm"
            className="ml-auto"
            aria-pressed={s.kind === "external" && s.done}
            aria-label={`Mark done: ${title}`}
            onClick={() => onTick(!(s.kind === "external" && s.done))}
            data-testid="mark-done"
          >
            {s.kind === "external" && s.done ? "Done" : "Mark done"}
          </Button>
        )
      ) : (
        item.problem.published && <DifficultyBadge difficulty={item.problem.difficulty} variant="text" className="ml-auto" />
      )}
    </li>
  );
}

function ItemEditDialog({ planId, item, onSaved }: { planId: string; item: PlanItemView; onSaved: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ note?: string; title?: string; form?: string }>({});
  const title = itemTitle(item);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = itemNoteSchema.safeParse(String(form.get("note") ?? ""));
    const customTitle =
      item.kind === "external" ? externalTitleSchema.safeParse(String(form.get("title") ?? "")) : null;
    const next = {
      note: note.success ? undefined : note.error.issues[0]?.message,
      title: customTitle && !customTitle.success ? customTitle.error.issues[0]?.message : undefined,
    };
    setErrors(next);
    if (!note.success || (customTitle && !customTitle.success)) return;
    setPending(true);
    const res = await sendJson("PATCH", `/api/plans/${planId}/items/${item.id}`, {
      note: note.data,
      ...(customTitle?.success ? { title: customTitle.data } : {}),
    });
    setPending(false);
    if (!res.ok) {
      setErrors({ note: res.fieldErrors?.note, title: res.fieldErrors?.title, form: res.fieldErrors ? undefined : res.error });
      return;
    }
    setOpen(false);
    onSaved();
  }

  return (
    <>
      <IconButton label={`Edit the note of ${title}`} onClick={() => setOpen(true)} testId="edit-item">
        <PencilIcon aria-hidden />
      </IconButton>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || setErrors({}))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
            {item.kind === "external" && (
              <Field>
                <Label htmlFor={`${id}-title`}>Title</Label>
                <Input
                  id={`${id}-title`}
                  name="title"
                  defaultValue={item.external.title}
                  maxLength={EXTERNAL_TITLE_MAX * 2}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? `${id}-title-error` : undefined}
                />
                {errors.title && <FieldError id={`${id}-title-error`}>{errors.title}</FieldError>}
              </Field>
            )}
            <Field>
              <Label htmlFor={`${id}-note`}>Note (optional)</Label>
              <Input
                id={`${id}-note`}
                name="note"
                defaultValue={item.note ?? ""}
                maxLength={ITEM_NOTE_MAX * 2}
                placeholder="Follow-up: at most k repeats"
                aria-invalid={errors.note ? true : undefined}
                aria-describedby={errors.note ? `${id}-note-error` : `${id}-note-hint`}
              />
              {errors.note ? (
                <FieldError id={`${id}-note-error`}>{errors.note}</FieldError>
              ) : (
                <FieldHelp id={`${id}-note-hint`}>Up to {ITEM_NOTE_MAX} characters. Everyone who can open the plan sees it.</FieldHelp>
              )}
            </Field>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionControls({
  planId,
  sectionId,
  title,
  canUp,
  canDown,
  onMove,
  onChanged,
}: {
  planId: string;
  sectionId: string;
  title: string;
  canUp: boolean;
  canDown: boolean;
  onMove: (direction: Direction) => void;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);

  async function onDelete() {
    const res = await sendJson("DELETE", `/api/plans/${planId}/sections/${sectionId}`);
    setConfirming(false);
    if (!res.ok) {
      toast.error("Could not delete the section", { description: res.error });
      return;
    }
    onChanged();
  }

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={`Edit section ${title}`}>
      <IconButton id={`${sectionId}-up`} label={`Move section ${title} up`} disabled={!canUp} onClick={() => onMove("up")}>
        <ArrowUpIcon aria-hidden />
      </IconButton>
      <IconButton id={`${sectionId}-down`} label={`Move section ${title} down`} disabled={!canDown} onClick={() => onMove("down")}>
        <ArrowDownIcon aria-hidden />
      </IconButton>
      <IconButton label={`Rename section ${title}`} onClick={() => setRenaming(true)}>
        <PencilIcon aria-hidden />
      </IconButton>
      <IconButton label={`Delete section ${title}`} onClick={() => setConfirming(true)}>
        <Trash2Icon aria-hidden />
      </IconButton>
      <SectionNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        heading="Rename section"
        initial={title}
        submitLabel="Rename"
        onSubmit={(name) => sendJson("PATCH", `/api/plans/${planId}/sections/${sectionId}`, { title: name })}
        onDone={onChanged}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this section?</AlertDialogTitle>
            <AlertDialogDescription>
              Its problems stay in the plan: they move to the end of the top list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionNameDialog({
  open,
  onOpenChange,
  heading,
  initial,
  submitLabel,
  onSubmit,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  initial: string;
  submitLabel: string;
  onSubmit: (title: string) => Promise<{ ok: boolean; error?: string; fieldErrors?: Partial<Record<string, string>> }>;
  onDone: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = sectionTitleSchema.safeParse(String(new FormData(event.currentTarget).get("title") ?? ""));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a section name");
      return;
    }
    setPending(true);
    const res = await onSubmit(parsed.data);
    setPending(false);
    if (!res.ok) {
      setError(res.fieldErrors?.title ?? res.error ?? "Something went wrong. Try again.");
      return;
    }
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), o || setError(null))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>Sections group the problems of a plan, e.g. by topic or by week.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field>
            <Label htmlFor={`${id}-title`}>Section name</Label>
            <Input
              id={`${id}-title`}
              name="title"
              defaultValue={initial}
              autoComplete="off"
              maxLength={SECTION_TITLE_MAX * 2}
              placeholder="Dynamic programming"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              autoFocus
            />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSection({ planId, disabled, onAdded }: { planId: string; disabled: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex flex-wrap items-center gap-3")}>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled} data-testid="add-section">
        <PlusIcon aria-hidden />
        Add a section
      </Button>
      {disabled && <p className="text-sm text-muted-foreground">A plan has at most {MAX_SECTIONS_PER_PLAN} sections.</p>}
      <SectionNameDialog
        open={open}
        onOpenChange={setOpen}
        heading="New section"
        initial=""
        submitLabel="Add section"
        onSubmit={(title) => sendJson("POST", `/api/plans/${planId}/sections`, { title })}
        onDone={onAdded}
      />
    </div>
  );
}
