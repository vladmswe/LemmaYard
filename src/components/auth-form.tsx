"use client";

import { CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_HINT, USERNAME_RULE, type AuthErrorBody } from "@/lib/auth/schemas";
import { safeRedirectPath } from "@/lib/safe-redirect";

type Mode = "login" | "register";
type FieldName = "email" | "username" | "password";

type FieldConfig = {
  name: FieldName;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
};

const FIELDS: Record<Mode, FieldConfig[]> = {
  login: [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: "current-password",
    },
  ],
  register: [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    {
      name: "username",
      label: "Username",
      type: "text",
      autoComplete: "username",
      hint: USERNAME_RULE,
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: "new-password",
      hint: PASSWORD_HINT,
    },
  ],
};

const SUBMIT_LABEL: Record<Mode, { idle: string; pending: string }> = {
  login: { idle: "Log in", pending: "Logging in…" },
  register: { idle: "Create account", pending: "Creating account…" },
};

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  // Where focus goes after a failed attempt: the disabled fieldset drops focus
  // to <body> while pending, so put it on the first invalid field (or back on
  // the submit button) once the form is enabled again.
  const focusTarget = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (pending || !focusTarget.current) return;
    formRef.current?.querySelector<HTMLElement>(focusTarget.current)?.focus();
    focusTarget.current = null;
  }, [pending]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      FIELDS[mode].map((f) => [f.name, String(data.get(f.name) ?? "")]),
    );

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.replace(safeRedirectPath(next));
        router.refresh();
        return; // keep the form disabled while navigating
      }
      const payload = (await res.json().catch(() => null)) as AuthErrorBody | null;
      const errors = payload?.fieldErrors ?? {};
      setFieldErrors(errors);
      // Field errors are shown inline; the general message only when none apply.
      const firstInvalid = FIELDS[mode].find((f) => errors[f.name]);
      const shownInline = Boolean(firstInvalid);
      focusTarget.current = firstInvalid ? `[name="${firstInvalid.name}"]` : "button[type=submit]";
      setFormError(
        shownInline ? null : (payload?.error ?? "Something went wrong. Try again."),
      );
    } catch {
      setFormError("Network error. Check your connection and try again.");
      focusTarget.current = "button[type=submit]";
    }
    setPending(false);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <Alert variant="danger" role="alert" className="motion-safe:animate-enter-up">
          <CircleAlertIcon aria-hidden />
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      )}
      <fieldset disabled={pending} className="flex flex-col gap-4">
        {FIELDS[mode].map((field) => {
          const id = `${mode}-${field.name}`;
          const error = fieldErrors[field.name];
          // The error replaces the hint (they usually say the same thing).
          const describedBy = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined;
          return (
            <Field key={field.name}>
              <Label htmlFor={id}>{field.label}</Label>
              <Input
                id={id}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
              />
              {error ? (
                <FieldError id={`${id}-error`}>{error}</FieldError>
              ) : (
                field.hint && <FieldHelp id={`${id}-hint`}>{field.hint}</FieldHelp>
              )}
            </Field>
          );
        })}
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          {pending ? SUBMIT_LABEL[mode].pending : SUBMIT_LABEL[mode].idle}
        </Button>
      </fieldset>
    </form>
  );
}
