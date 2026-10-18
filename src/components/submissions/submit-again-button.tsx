"use client";

import { SquarePenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import type { Language } from "@/lib/submission-dto";
import { getBrowserStorage, saveDraft, saveLanguage } from "@/lib/workspace/storage";

/**
 * "Open in editor": opens the problem with this submission's code as the
 * editor draft for its language (the same localStorage draft the editor
 * restores, AC-M5-2), ready to change and submit again. A plain link
 * without JS: the problem opens with the current draft.
 */
export function SubmitAgainLink({
  slug,
  language,
  code,
  className,
}: {
  slug: string;
  language: Language;
  code: string;
  className?: string;
}) {
  const router = useRouter();
  const href = `/problems/${slug}`;
  return (
    <a
      href={href}
      className={buttonVariants({ variant: "secondary", size: "sm", className: cn("max-sm:h-10", className) })}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        const local = getBrowserStorage("local");
        saveDraft(local, slug, language, code);
        saveLanguage(local, slug, language);
        router.push(href);
      }}
      data-testid="submit-again"
    >
      <SquarePenIcon aria-hidden />
      Open in editor
      <span className="sr-only">: opens the problem with this code as your draft</span>
    </a>
  );
}
