"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CodeLanguage } from "@/lib/guide/contracts";
import { useGuidePrefs, writePrefs } from "@/lib/guide/prefs";

interface Listing {
  html: string; // server-rendered Shiki HTML
  source: string;
}

const LABELS: Record<CodeLanguage, string> = { python: "Python", javascript: "JavaScript" };
const ORDER: CodeLanguage[] = ["python", "javascript"];

/** Python / JavaScript tabs sharing the guide's language preference, with a Copy button. */
export function CodeTabsClient({
  refId,
  title,
  python,
  javascript,
}: {
  refId: string;
  title?: string;
  python: Listing;
  javascript: Listing;
}) {
  const { codeLanguage } = useGuidePrefs();
  const [copied, setCopied] = useState<CodeLanguage | null>(null);
  const [status, setStatus] = useState("");
  const listings: Record<CodeLanguage, Listing> = { python, javascript };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listings[codeLanguage].source);
      setCopied(codeLanguage);
      setStatus(`${LABELS[codeLanguage]} code copied`);
    } catch {
      setStatus("Could not copy the code");
    }
  };

  return (
    <figure className="guide-code" data-code-tabs={refId}>
      {title && <figcaption className="guide-code-title">{title}</figcaption>}
      <Tabs
        value={codeLanguage}
        onValueChange={(v) => {
          writePrefs({ codeLanguage: v as CodeLanguage });
          setCopied(null);
        }}
        className="gap-0"
      >
        <div className="flex items-end justify-between gap-2">
          <TabsList aria-label="Code language" className="flex-1">
            {ORDER.map((lang) => (
              <TabsTrigger key={lang} value={lang} className="min-h-11" data-code-tab={lang}>
                {LABELS[lang]}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button type="button" variant="ghost" className="min-h-11" onClick={copy}>
            {copied === codeLanguage ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            Copy
          </Button>
        </div>
        {ORDER.map((lang) => (
          <TabsContent key={lang} value={lang} keepMounted className="pt-2">
            <div
              tabIndex={0}
              role="region"
              aria-label={`${LABELS[lang]} code`}
              className="guide-code-body"
              data-code-listing={lang}
              dangerouslySetInnerHTML={{ __html: listings[lang].html }}
            />
          </TabsContent>
        ))}
      </Tabs>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </figure>
  );
}
