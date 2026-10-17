"use client";

import { CloudUploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import type { Language } from "@/lib/submission-dto";
import { getBrowserStorage, saveDraft, saveLanguage } from "@/lib/workspace/storage";

/**
 * "Submit again": opens the problem with this submission's code as the
 * editor draft for its language (the same localStorage draft the editor
 * restores, AC-M5-2). A plain link without JS: the problem opens with the
 * current draft.
 */
export function SubmitAgainLink({ slug, language, code }: { slug: string; language: Language; code: string }) {
  const router = useRouter();
  const href = `/problems/${slug}`;
  return (
    <a
      href={href}
      className={buttonVariants({ variant: "secondary" })}
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
      <CloudUploadIcon aria-hidden />
      Submit again
      <span className="sr-only">: opens the problem with this code in the editor</span>
    </a>
  );
}
