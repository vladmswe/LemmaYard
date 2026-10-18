"use client";

import { ListPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { QedLoader } from "@/components/brand/qed-loader";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PLAN_TITLE_MAX, planTitleSchema, SECTION_TITLE_MAX, sectionTitleSchema } from "@/lib/plans/schemas";
import type { PickerPlan } from "@/server/plans/read";

import { getJson, sendJson } from "./plans-api";
import { VISIBILITY } from "./visibility";

const NEW = "new";

/**
 * "Add to a study plan" (mockup 05) for one of our problems: a new plan (with
 * a title) or one of the viewer's plans, plus an optional section name (an
 * existing section of that name is reused). A plan that already holds the
 * problem is shown but cannot be picked. Plans load when the dialog opens,
 * so the trigger costs the page nothing. Focus returns to the trigger.
 */
export function AddToPlanDialog({
  problem,
  compact = false,
}: {
  problem: { slug: string; title: string };
  /** Icon-only trigger (catalog rows). */
  compact?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<PickerPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(NEW);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; section?: string; form?: string }>({});

  async function load() {
    setPlans(null);
    setLoadError(null);
    const res = await getJson<{ plans: PickerPlan[] }>(`/api/plans?problem=${encodeURIComponent(problem.slug)}`);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setPlans(res.data.plans);
    const firstFree = res.data.plans.find((p) => !p.hasProblem);
    setChoice(firstFree ? firstFree.id : NEW);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawSection = String(form.get("section") ?? "").trim();
    const section = rawSection ? sectionTitleSchema.safeParse(rawSection) : null;
    const title = choice === NEW ? planTitleSchema.safeParse(String(form.get("title") ?? "")) : null;
    setErrors({
      title: title && !title.success ? title.error.issues[0]?.message : undefined,
      section: section && !section.success ? section.error.issues[0]?.message : undefined,
    });
    if ((title && !title.success) || (section && !section.success)) return;
    const sectionBody = section?.success ? { section: { title: section.data } } : {};
    const items = [{ problemSlug: problem.slug }];
    setPending(true);
    const res =
      choice === NEW
        ? await sendJson<{ id?: string; added: number }>("POST", "/api/plans", { title: title!.data, items, ...sectionBody })
        : await sendJson<{ id?: string; added: number }>("POST", `/api/plans/${choice}/items`, { items, ...sectionBody });
    setPending(false);
    if (!res.ok) {
      setErrors({ title: res.fieldErrors?.title, form: res.fieldErrors?.title ? undefined : res.error });
      return;
    }
    const planId = choice === NEW ? res.data.id! : choice;
    const planTitle = choice === NEW ? title!.data : (plans?.find((p) => p.id === choice)?.title ?? "your plan");
    setOpen(false);
    toast.success(res.data.added > 0 ? `Added to “${planTitle}”` : `Already in “${planTitle}”`, {
      description: problem.title,
      action: { label: "Open plan", onClick: () => router.push(`/plans/${planId}`) },
    });
  }

  const selected = plans?.find((p) => p.id === choice);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setErrors({});
        if (o) void load();
      }}
    >
      <DialogTrigger
        render={
          compact ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Add ${problem.title} to a study plan`}
              title="Add to a study plan"
              data-testid="add-to-plan"
            />
          ) : (
            <Button variant="secondary" size="sm" data-testid="add-to-plan" />
          )
        }
      >
        <ListPlusIcon aria-hidden />
        {!compact && "Add to plan"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to a study plan</DialogTitle>
          <DialogDescription>
            {problem.title}. A plan that already has it is skipped.
          </DialogDescription>
        </DialogHeader>
        {loadError ? (
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
        ) : plans === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <QedLoader className="size-3.5" /> Loading your plans…
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {errors.form && (
              <p role="alert" className="text-sm text-danger">
                {errors.form}
              </p>
            )}
            <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
              <legend className="sr-only">Plan</legend>
              <RadioGroup
                value={choice}
                onValueChange={(v) => setChoice(String(v))}
                aria-label="Plan"
                className="max-h-[min(22rem,50vh)] gap-2 overflow-y-auto p-0.5"
              >
                <PlanOption value={NEW} selected={choice === NEW} title="New plan">
                  {choice === NEW && (
                    <Field className="mt-2">
                      <Label htmlFor={`${id}-title`} className="sr-only">
                        New plan title
                      </Label>
                      <Input
                        id={`${id}-title`}
                        name="title"
                        autoComplete="off"
                        maxLength={PLAN_TITLE_MAX * 2}
                        placeholder="Fall interview prep"
                        aria-invalid={errors.title ? true : undefined}
                        aria-describedby={errors.title ? `${id}-title-error` : undefined}
                        autoFocus
                      />
                      {errors.title && <FieldError id={`${id}-title-error`}>{errors.title}</FieldError>}
                    </Field>
                  )}
                </PlanOption>
                {plans.map((p) => (
                  <PlanOption
                    key={p.id}
                    value={p.id}
                    selected={choice === p.id}
                    disabled={p.hasProblem}
                    title={p.title}
                    meta={[
                      VISIBILITY[p.visibility].short,
                      p.sectionTitles.length > 0
                        ? `${p.sectionTitles.length} ${p.sectionTitles.length === 1 ? "section" : "sections"}`
                        : null,
                      `${p.itemCount} ${p.itemCount === 1 ? "problem" : "problems"}`,
                      p.hasProblem ? "already has it" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </RadioGroup>
              <Field>
                <Label htmlFor={`${id}-section`}>Section (optional)</Label>
                <Input
                  id={`${id}-section`}
                  name="section"
                  autoComplete="off"
                  maxLength={SECTION_TITLE_MAX * 2}
                  list={selected && selected.sectionTitles.length > 0 ? `${id}-sections` : undefined}
                  placeholder="Arrays and hashing"
                  aria-invalid={errors.section ? true : undefined}
                  aria-describedby={errors.section ? `${id}-section-error` : `${id}-section-hint`}
                />
                {selected && selected.sectionTitles.length > 0 && (
                  <datalist id={`${id}-sections`}>
                    {selected.sectionTitles.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                )}
                {errors.section ? (
                  <FieldError id={`${id}-section-error`}>{errors.section}</FieldError>
                ) : (
                  <FieldHelp id={`${id}-section-hint`}>Empty: the top of the plan. A new name creates a section.</FieldHelp>
                )}
              </Field>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
                <Button type="submit" loading={pending} data-testid="add-to-plan-submit">
                  Add to plan
                </Button>
              </DialogFooter>
            </fieldset>
            <p className="text-sm text-muted-foreground">
              <Link href="/plans" className="text-link underline-offset-4 hover:underline">
                All your study plans
              </Link>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlanOption({
  value,
  selected,
  disabled = false,
  title,
  meta,
  children,
}: {
  value: string;
  selected: boolean;
  disabled?: boolean;
  title: string;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 transition-colors duration-120",
        selected ? "border-primary bg-primary/5" : "border-border",
        disabled && "opacity-70",
      )}
    >
      <label className={cn("flex items-start gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
        <RadioGroupItem value={value} disabled={disabled} className="mt-1" />
        <span className="min-w-0">
          <span className="block font-semibold break-words" dir="auto">
            {title}
          </span>
          {meta && <span className="block text-sm text-muted-foreground">{meta}</span>}
        </span>
      </label>
      {children}
    </div>
  );
}
