"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

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
import { planDescriptionSchema, planTitleSchema } from "@/lib/plans/schemas";

import { PlanTextFields } from "./plan-actions";
import { sendJson } from "./plans-api";

/** "New plan" on /plans: title and optional description; the plan starts private and opens on success. */
export function NewPlanDialog({ variant = "default" }: { variant?: "default" | "secondary" }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; description?: string; form?: string }>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = planTitleSchema.safeParse(String(form.get("title") ?? ""));
    const description = planDescriptionSchema.safeParse(String(form.get("description") ?? ""));
    setErrors({
      title: title.success ? undefined : title.error.issues[0]?.message,
      description: description.success ? undefined : description.error.issues[0]?.message,
    });
    if (!title.success || !description.success) return;
    setPending(true);
    const res = await sendJson<{ id: string }>("POST", "/api/plans", {
      title: title.data,
      ...(description.data ? { description: description.data } : {}),
    });
    if (res.ok) {
      toast.success(`Plan "${title.data}" created`, { description: "Add problems from LemmaYard or LeetCode links." });
      router.push(`/plans/${res.data.id}`);
      return;
    }
    setPending(false);
    setErrors({ title: res.fieldErrors?.title, description: res.fieldErrors?.description, form: res.error });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || setErrors({}))}>
      <DialogTrigger render={<Button variant={variant} data-testid="new-plan" />}>
        <PlusIcon aria-hidden />
        New plan
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New study plan</DialogTitle>
          <DialogDescription>
            An ordered list of problems, ours or LeetCode links. It starts private; share it by link or make it public
            later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form && !errors.title && !errors.description && (
            <p role="alert" className="text-sm text-danger">
              {errors.form}
            </p>
          )}
          <fieldset disabled={pending} className="flex flex-col gap-4">
            <PlanTextFields id={id} errors={errors} title="" description="" />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
              <Button type="submit" loading={pending}>
                Create plan
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
