"use client";

// Fields of a LeetCode problem (docs/specs/rooms-external-problems.md §2):
// link with inline validation, optional title (placeholder = the default from
// the slug), optional difficulty and an optional display-only rating. Shared
// by Settings → LeetCode problems and the lobby's "Paste a link".
import { useId, useState } from "react";

import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  EXTERNAL_RATING_MAX,
  EXTERNAL_TITLE_MAX,
  EXTERNAL_URL_MAX,
  parseLeetCodeUrl,
  titleFromSlug,
  type ExternalForm,
} from "@/lib/rooms/external";

const DIFFICULTY_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

export function ExternalProblemFields({
  form,
  onChange,
  errors,
  disabled,
  autoFocus = false,
}: {
  form: ExternalForm;
  onChange: (patch: Partial<ExternalForm>) => void;
  /** Errors from the last submit (server or client). */
  errors: Record<string, string>;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const parsed = parseLeetCodeUrl(form.url);
  // Inline: say what is wrong once the person typed something and left the field (or submitted).
  const urlError = errors.url ?? (touched && form.url.trim() !== "" && !parsed.ok ? parsed.error : null);
  const slug = parsed.ok ? parsed.slug : null;

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <Label htmlFor={`${id}-url`}>LeetCode link</Label>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={form.url}
          onChange={(e) => onChange({ url: e.target.value })}
          onBlur={() => setTouched(true)}
          maxLength={EXTERNAL_URL_MAX}
          placeholder="https://leetcode.com/problems/two-sum/"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={urlError ? true : undefined}
          aria-describedby={`${id}-url-status`}
          data-testid="external-url"
        />
        <div id={`${id}-url-status`} aria-live="polite">
          {urlError ? (
            <FieldError>{urlError}</FieldError>
          ) : slug ? (
            <FieldHelp>
              LeetCode problem <span className="font-mono text-foreground">{slug}</span>. We only store the name in the
              link; nothing is loaded from leetcode.com.
            </FieldHelp>
          ) : (
            <FieldHelp>Paste the problem&apos;s address from leetcode.com/problems/…</FieldHelp>
          )}
        </div>
      </Field>
      <Field>
        <Label htmlFor={`${id}-title`}>Title (optional)</Label>
        <Input
          id={`${id}-title`}
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={EXTERNAL_TITLE_MAX * 2}
          placeholder={slug ? titleFromSlug(slug) : "Two Sum"}
          autoComplete="off"
          disabled={disabled}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${id}-title-e` : `${id}-title-h`}
          data-testid="external-title"
        />
        {errors.title ? (
          <FieldError id={`${id}-title-e`}>{errors.title}</FieldError>
        ) : (
          <FieldHelp id={`${id}-title-h`}>Leave it empty to use the name from the link.</FieldHelp>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-diff`} className="text-sm font-semibold text-foreground">
          Difficulty (optional)
        </span>
        <Segmented
          label="Difficulty (optional)"
          value={form.difficulty}
          onValueChange={(v) => !disabled && onChange({ difficulty: v })}
          options={DIFFICULTY_OPTIONS}
          className="self-start max-sm:w-full max-sm:[&>button]:flex-1"
        />
        {errors.difficulty && <FieldError>{errors.difficulty}</FieldError>}
      </div>
      <Field>
        <Label htmlFor={`${id}-rating`}>Rating (optional)</Label>
        <Input
          id={`${id}-rating`}
          inputMode="numeric"
          value={form.rating}
          onChange={(e) => onChange({ rating: e.target.value })}
          maxLength={4}
          placeholder="e.g. 1500"
          autoComplete="off"
          disabled={disabled}
          className="w-full sm:w-40"
          aria-invalid={errors.rating ? true : undefined}
          aria-describedby={errors.rating ? `${id}-rating-e` : `${id}-rating-h`}
          data-testid="external-rating"
        />
        {errors.rating ? (
          <FieldError id={`${id}-rating-e`}>{errors.rating}</FieldError>
        ) : (
          <FieldHelp id={`${id}-rating-h`}>
            Shown next to the problem only (0–{EXTERNAL_RATING_MAX}). It never changes anyone&apos;s rating.
          </FieldHelp>
        )}
      </Field>
    </div>
  );
}
