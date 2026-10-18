"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { bodyProblem } from "@/lib/community/body";
import { COMMUNITY_LIMITS } from "@/lib/community/types";

import { communityFetch } from "./community-api";
import { focusCommentWhenReady } from "./focus";

const Preview = dynamic(() => import("./user-markdown-preview"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading preview…</p>,
});

const MAX = COMMUNITY_LIMITS.bodyMaxChars;
const fmt = (n: number) => n.toLocaleString("en-US").replace(",", " ");

export type ComposerMode =
  | { kind: "create"; slug: string; parentId?: string | null }
  | { kind: "edit"; commentId: string };

/**
 * Comment composer (docs/specs/community.md §B.5, §B.15; mockup 01): Write /
 * Preview tabs (the preview lazy-loads the same sanitizer as the server, no
 * Shiki), a visible label, a character counter linked by aria-describedby,
 * the "Contains a solution" flag and field errors from the same rules as the
 * server. After posting, the server parts refresh and focus moves to the new
 * comment. Escape never discards the text.
 */
export function CommentComposer({
  mode,
  label,
  placeholder,
  submitLabel,
  initialBody = "",
  initialSpoiler = false,
  autoFocus = false,
  compact = false,
  onDone,
  onCancel,
}: {
  mode: ComposerMode;
  label: string;
  placeholder: string;
  submitLabel: string;
  initialBody?: string;
  initialSpoiler?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [spoiler, setSpoiler] = useState(initialSpoiler);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const length = body.trim().length;
  const over = length > MAX;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const problem = bodyProblem(body);
    if (problem) {
      setError(problem);
      setTab("write");
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    const result =
      mode.kind === "create"
        ? await communityFetch<{ comment: { id: string; status: string } }>("/api/comments", "POST", {
            target: `problem:${mode.slug}`,
            parentId: mode.parentId ?? null,
            body,
            hasSpoiler: spoiler,
          })
        : await communityFetch<{ comment: { id: string; status: string } }>(`/api/comments/${mode.commentId}`, "PATCH", {
            body,
            hasSpoiler: spoiler,
          });
    setPending(false);
    if (!result.ok) {
      const message = result.fieldErrors?.body ?? result.error;
      setError(message);
      if (result.status === 429 || result.status >= 500) toast.error(result.error);
      textareaRef.current?.focus();
      return;
    }
    const newId = result.data.comment.id;
    if (result.data.comment.status === "hidden_pending") {
      toast("Posted. A moderator will review it before others can see it.", { id: `held-${newId}` });
    }
    if (mode.kind === "create") {
      setBody("");
      setSpoiler(false);
    }
    setTab("write");
    onDone?.();
    startTransition(() => router.refresh());
    focusCommentWhenReady(newId);
  }

  return (
    <form
      onSubmit={submit}
      className={cn("rounded-lg border border-input bg-card focus-within:border-ring", compact && "rounded-md")}
      aria-label={label}
      noValidate
    >
      <div className="flex items-stretch border-b px-2" role="tablist" aria-label={`${label}: mode`}>
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`${id}-${t}`}
            id={`${id}-${t}-tab`}
            onClick={() => setTab(t)}
            className="relative inline-flex h-10 cursor-pointer items-center px-3 text-sm font-medium text-muted-foreground transition-colors duration-120 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-selected:font-semibold aria-selected:text-foreground aria-selected:shadow-[inset_0_-2px_0_var(--primary)]"
          >
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
        <span className="ml-auto hidden items-center pr-1 text-xs text-muted-foreground sm:inline-flex">
          Markdown · code blocks with a language
        </span>
      </div>
      <div id={`${id}-write`} role="tabpanel" aria-labelledby={`${id}-write-tab`} hidden={tab !== "write"}>
        <label htmlFor={`${id}-body`} className="sr-only">
          {label}
        </label>
        <textarea
          ref={textareaRef}
          id={`${id}-body`}
          name="body"
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          aria-describedby={error ? `${counterId} ${errorId}` : counterId}
          aria-invalid={error || over ? true : undefined}
          dir="auto"
          rows={compact ? 3 : 4}
          className="block min-h-24 w-full resize-y bg-transparent px-3.5 py-3 text-[0.9375rem] leading-6 text-foreground placeholder:text-faint-foreground focus:outline-none"
          data-testid="comment-body"
        />
      </div>
      <div
        id={`${id}-preview`}
        role="tabpanel"
        aria-labelledby={`${id}-preview-tab`}
        hidden={tab !== "preview"}
        className="min-h-24 px-3.5 py-3"
      >
        {tab === "preview" &&
          (body.trim() ? <Preview>{body}</Preview> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>)}
      </div>
      {error && (
        <FieldError id={errorId} className="px-3.5 pb-2">
          {error}
        </FieldError>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3.5 py-2.5">
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-foreground-secondary">
          <Checkbox checked={spoiler} onCheckedChange={(v) => setSpoiler(Boolean(v))} data-testid="spoiler-checkbox" />
          <span>
            Contains a solution <span className="max-sm:hidden">(hidden until solved)</span>
          </span>
        </label>
        <div className="ml-auto flex items-center gap-3">
          <span
            id={counterId}
            className={cn("text-xs tabular-nums", over ? "font-semibold text-danger" : "text-muted-foreground")}
          >
            {fmt(length)} / {fmt(MAX)}
            <span className="sr-only"> characters</span>
          </span>
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" loading={pending} disabled={over} data-testid="comment-submit">
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
