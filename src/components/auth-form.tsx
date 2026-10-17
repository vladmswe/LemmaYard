"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN, type AuthErrorBody } from "@/lib/auth/schemas";
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
      hint: "3-20 characters: lowercase letters, digits or underscore.",
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: "new-password",
      hint: `At least ${PASSWORD_MIN} characters.`,
    },
  ],
};

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

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
      const shownInline = FIELDS[mode].some((f) => errors[f.name]);
      setFormError(
        shownInline ? null : (payload?.error ?? "Something went wrong. Try again."),
      );
    } catch {
      setFormError("Network error. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}
      <fieldset disabled={pending} className="flex flex-col gap-4">
        {FIELDS[mode].map((field) => {
          const id = `${mode}-${field.name}`;
          const error = fieldErrors[field.name];
          const describedBy = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined;
          return (
            <div key={field.name} className="flex flex-col gap-2">
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
                <p id={`${id}-error`} className="text-sm text-destructive">
                  {error}
                </p>
              ) : (
                field.hint && (
                  <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                    {field.hint}
                  </p>
                )
              )}
            </div>
          );
        })}
        <Button type="submit" className="mt-2 w-full" aria-busy={pending}>
          {pending
            ? mode === "login"
              ? "Logging in..."
              : "Creating account..."
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </Button>
      </fieldset>
    </form>
  );
}
