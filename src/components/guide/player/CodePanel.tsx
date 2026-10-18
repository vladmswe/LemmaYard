"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import type { CodeBundle, CodeLanguage, LineId } from "@/lib/guide/contracts";

const LANGS: { id: CodeLanguage; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
];

/**
 * Python / JavaScript listing with the frame's line highlighted. The listing
 * HTML comes from the server; the active line gets data-active="true" and the
 * panel (never the page) scrolls to keep it visible.
 */
export function CodePanel({
  idPrefix,
  code,
  language,
  line,
  open,
  onLanguage,
}: {
  idPrefix: string;
  code: CodeBundle;
  language: CodeLanguage;
  line: LineId | null;
  /** Whether the surrounding disclosure is open; the active line is scrolled into view on open. */
  open: boolean;
  onLanguage: (lang: CodeLanguage) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<CodeLanguage, HTMLButtonElement | null>>>({});
  const listing = code[language];
  const lines = line ? (listing.lineMap[line] ?? []) : [];
  const linesKey = lines.join(",");

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const active = new Set(linesKey ? linesKey.split(",") : []);
    let first: HTMLElement | null = null;
    box.querySelectorAll<HTMLElement>("[data-line]").forEach((el) => {
      const on = active.has(el.dataset.line ?? "");
      if (on) {
        el.setAttribute("data-active", "true");
        first ??= el;
      } else {
        el.removeAttribute("data-active");
      }
    });
    if (first && open) {
      const el: HTMLElement = first;
      const boxRect = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top < boxRect.top || r.bottom > boxRect.bottom) {
        box.scrollTop += r.top - boxRect.top - box.clientHeight / 3;
      }
    }
  }, [linesKey, language, listing.html, open]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = LANGS.findIndex((l) => l.id === language);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? LANGS.length - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + LANGS.length) % LANGS.length;
    const lang = (LANGS[next] as (typeof LANGS)[number]).id;
    onLanguage(lang);
    tabRefs.current[lang]?.focus();
  };

  const panelId = `${idPrefix}-code-panel`;
  return (
    <div className="flex min-h-0 flex-col gap-2" data-player-code-wrap="">
      <div role="tablist" aria-label="Code language" className="flex gap-1">
        {LANGS.map((l) => {
          const selected = l.id === language;
          return (
            <button
              key={l.id}
              ref={(el) => {
                tabRefs.current[l.id] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${l.id}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onLanguage(l.id)}
              onKeyDown={onTabKey}
              data-code-tab={l.id}
              className={
                "min-h-11 rounded-full border px-3.5 text-sm transition-colors duration-(--d-1) " +
                (selected
                  ? "border-foreground bg-foreground font-semibold text-background"
                  : "border-border-strong text-muted-foreground hover:text-foreground")
              }
            >
              {l.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${language}`}
        data-player-code=""
        data-language={language}
      >
        <p className="sr-only" data-code-current="">
          {lines.length > 0 ? `Current line: ${lines.join(", ")}` : "No current line"}
        </p>
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label={`${language === "python" ? "Python" : "JavaScript"} code`}
          className="guide-player-code max-h-72 overflow-auto rounded-[14px] border border-border py-2 font-mono text-[0.8125rem] leading-6 lg:max-h-[28rem]"
          data-code-scroll=""
          dangerouslySetInnerHTML={{ __html: listing.html }}
        />
      </div>
    </div>
  );
}
