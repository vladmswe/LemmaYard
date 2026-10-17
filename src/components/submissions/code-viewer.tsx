"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/submission-dto";
import { MONACO_LANGUAGE } from "@/lib/workspace/languages";

import type { CodeViewerMonacoProps } from "./code-viewer-monaco";

/** Monaco line height (MONACO_EDITOR_OPTIONS) and the viewer's top + bottom padding. */
const LINE_HEIGHT = 22;
const PADDING = 24;

/** Until Monaco loads (and without JS): the same code as plain text, same metrics. */
function PlainCode({ code, hidden }: { code: string; hidden: boolean }) {
  return (
    <pre
      aria-hidden={hidden || undefined}
      className="h-full overflow-auto bg-editor px-4 py-3 font-mono text-sm/[1.375rem] text-foreground"
    >
      <code>{code}</code>
    </pre>
  );
}

const LazyMonaco = dynamic<CodeViewerMonacoProps>(() => import("./code-viewer-monaco"), {
  ssr: false,
  loading: () => null,
});

/**
 * The submitted code in a read-only Monaco (DESIGN.md §9.6), height
 * min(content, 70vh), with a "Copy code" button. Server-rendered as plain
 * text, so the code is readable before (or without) the editor bundle.
 */
export function CodeViewer({ id, language, code }: { id: string; language: Language; code: string }) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    // After hydration only: the SSR markup is the plain-text fallback.
    queueMicrotask(() => setMounted(true));
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const lines = code.split("\n").length;
  const height = `min(${lines * LINE_HEIGHT + PADDING}px, 70vh)`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy the code. Select it and copy it by hand.");
    }
  }

  return (
    <section aria-labelledby="code-heading" className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <div className="flex h-12 items-center justify-between gap-3 border-b px-4">
        <h2 id="code-heading" className="text-[1.0625rem]/6 font-semibold">
          Code
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {MONACO_LANGUAGE[language].file}
          </span>
        </h2>
        <Button variant="ghost" size="sm" onClick={copy} data-testid="copy-code">
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <div className="relative" style={{ height }} data-testid="code-viewer">
        {/* The plain text stays underneath until Monaco paints over it (no blank flash). */}
        <PlainCode code={code} hidden={mounted} />
        {mounted && (
          <div className="absolute inset-0" data-testid="code-viewer-editor">
            <LazyMonaco id={id} language={language} code={code} />
          </div>
        )}
      </div>
    </section>
  );
}
