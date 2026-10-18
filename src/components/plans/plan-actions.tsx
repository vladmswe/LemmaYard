"use client";

import { BookmarkCheckIcon, BookmarkIcon, CopyIcon, PencilIcon, Share2Icon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  PLAN_DESCRIPTION_MAX,
  PLAN_TITLE_MAX,
  planDescriptionSchema,
  planTitleSchema,
  type PlanVisibility,
} from "@/lib/plans/schemas";

import { AddProblemsDialog } from "./add-problems-dialog";
import { sendJson } from "./plans-api";
import { shareUrl } from "./visibility-card";

// PageHead's actions slot does not shrink: below 961px give the row the
// container width so its buttons wrap instead of running off the page.
const ACTIONS_ROW =
  "flex w-[calc(100vw-2*var(--pad))] max-w-full flex-wrap items-center gap-2 min-[961px]:w-auto min-[961px]:justify-end";

type Props = {
  planId: string;
  title: string;
  description: string | null;
  visibility: PlanVisibility;
  isOwner: boolean;
  signedIn: boolean;
  saved: boolean;
  /** Owner: the plan's token; reader: the token they opened it with. */
  shareToken: string | null;
  origin: string;
  sections: { id: string; title: string }[];
  loginHref: string;
};

/** The plan head's actions: owner (add problems, edit, share, delete) or reader (save, duplicate, copy link). */
export function PlanActions(props: Props) {
  const { planId, visibility, isOwner, signedIn, shareToken, origin, loginHref } = props;
  const link = shareUrl(origin, planId, visibility, shareToken);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  const shareButton = link && (
    <Button variant="secondary" onClick={copy}>
      <Share2Icon aria-hidden />
      Copy link
    </Button>
  );

  if (isOwner) {
    return (
      <div className={ACTIONS_ROW}>
        <AddProblemsDialog planId={planId} sections={props.sections} />
        <EditDetailsDialog planId={planId} title={props.title} description={props.description} />
        {shareButton}
        <DeletePlan planId={planId} title={props.title} />
      </div>
    );
  }
  return (
    <div className={ACTIONS_ROW}>
      {signedIn ? (
        <>
          <SaveToggle planId={planId} saved={props.saved} share={shareToken} />
          <DuplicateButton planId={planId} share={shareToken} />
        </>
      ) : (
        <Link href={loginHref} className={buttonVariants({ variant: "secondary" })}>
          Log in to duplicate or save
        </Link>
      )}
      {shareButton}
    </div>
  );
}

function SaveToggle({ planId, saved: initial, share }: { planId: string; saved: boolean; share: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  async function toggle() {
    const next = !saved;
    setPending(true);
    const res = await sendJson("PUT", `/api/plans/${planId}/save`, { saved: next, ...(share ? { share } : {}) });
    setPending(false);
    if (!res.ok) {
      toast.error("Could not save the plan", { description: res.error });
      return;
    }
    setSaved(next);
    toast.success(next ? "Saved to your study plans" : "Removed from your saved plans");
    startTransition(() => router.refresh());
  }
  return (
    <Button variant="secondary" aria-pressed={saved} onClick={toggle} loading={pending} data-testid="save-plan">
      {saved ? <BookmarkCheckIcon aria-hidden /> : <BookmarkIcon aria-hidden />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}

function DuplicateButton({ planId, share }: { planId: string; share: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function duplicate() {
    setPending(true);
    const res = await sendJson<{ id: string }>("POST", `/api/plans/${planId}/duplicate`, share ? { share } : {});
    if (!res.ok) {
      setPending(false);
      toast.error("Could not duplicate the plan", { description: res.error });
      return;
    }
    toast.success("Plan duplicated", { description: "The copy is private. Edit it as you like." });
    router.push(`/plans/${res.data.id}`);
  }
  return (
    <Button onClick={duplicate} loading={pending} data-testid="duplicate-plan">
      <CopyIcon aria-hidden />
      Duplicate
    </Button>
  );
}

function EditDetailsDialog({ planId, title, description }: { planId: string; title: string; description: string | null }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; description?: string; form?: string }>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const t = planTitleSchema.safeParse(String(form.get("title") ?? ""));
    const d = planDescriptionSchema.safeParse(String(form.get("description") ?? ""));
    setErrors({
      title: t.success ? undefined : t.error.issues[0]?.message,
      description: d.success ? undefined : d.error.issues[0]?.message,
    });
    if (!t.success || !d.success) return;
    setPending(true);
    const res = await sendJson("PATCH", `/api/plans/${planId}`, { title: t.data, description: d.data });
    setPending(false);
    if (!res.ok) {
      setErrors({ title: res.fieldErrors?.title, description: res.fieldErrors?.description, form: res.error });
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || setErrors({}))}>
      <DialogTrigger render={<Button variant="secondary" />}>
        <PencilIcon aria-hidden />
        Edit details
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>The title and the description are plain text.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form && !errors.title && !errors.description && <p className="text-sm text-danger">{errors.form}</p>}
          <PlanTextFields id={id} errors={errors} title={title} description={description ?? ""} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Title + description fields shared by "New plan" and "Edit plan". */
export function PlanTextFields({
  id,
  errors,
  title,
  description,
}: {
  id: string;
  errors: { title?: string; description?: string };
  title: string;
  description: string;
}) {
  return (
    <>
      <Field>
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          name="title"
          defaultValue={title}
          autoComplete="off"
          maxLength={PLAN_TITLE_MAX * 2}
          placeholder="Fall interview prep"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
          autoFocus
        />
        {errors.title && <FieldError id={`${id}-title-error`}>{errors.title}</FieldError>}
      </Field>
      <Field>
        <Label htmlFor={`${id}-description`}>Description (optional)</Label>
        <Textarea
          id={`${id}-description`}
          name="description"
          rows={3}
          defaultValue={description}
          maxLength={PLAN_DESCRIPTION_MAX * 2}
          placeholder="What this plan is for and how to use it"
          className="min-h-24"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? `${id}-description-error` : `${id}-description-hint`}
        />
        {errors.description ? (
          <FieldError id={`${id}-description-error`}>{errors.description}</FieldError>
        ) : (
          <FieldHelp id={`${id}-description-hint`}>Plain text, up to {PLAN_DESCRIPTION_MAX} characters.</FieldHelp>
        )}
      </Field>
    </>
  );
}

function DeletePlan({ planId, title }: { planId: string; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function onDelete() {
    setPending(true);
    const res = await sendJson("DELETE", `/api/plans/${planId}`);
    if (!res.ok) {
      setPending(false);
      toast.error("Could not delete the plan", { description: res.error });
      return;
    }
    toast.success(`Deleted "${title}"`);
    router.push("/plans");
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" />}>
        <Trash2Icon aria-hidden />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
          <AlertDialogDescription>
            The plan, its sections and its items are deleted for good. Your submissions are not affected; people who
            saved the plan lose it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete} loading={pending}>
            Delete plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
