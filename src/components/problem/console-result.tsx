"use client";

import { ClockIcon, ExternalLinkIcon, RotateCwIcon, TriangleAlertIcon, CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";

import { VerdictIcon, VerdictLabel } from "@/components/judge/verdict-badge";
import { CASE_STATUSES, VERDICTS } from "@/components/judge/verdict";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/tooltip";
import {
  formatMemory,
  formatMs,
  type CaseView,
  type InputView,
  type ResultView,
  type ValueView,
} from "@/lib/workspace/judge-state";

import { pillClasses, valueBlockClasses } from "./console-testcase";
import { ShortcutKeys } from "./editor-toolbar";

export type ConsoleResultProps = {
  view: ResultView;
  /** "Try again" on Internal Error / judge unavailable. */
  onRetry?: () => void;
};

/**
 * Result tab body (DESIGN.md §8.22). The pane's `aria-live` region would
 * announce every poll, so the visible part is `aria-live="off"` and one
 * sr-only line carries the final announcement.
 */
export function ConsoleResult({ view, onRetry }: ConsoleResultProps) {
  const announce = "announce" in view ? view.announce : "";
  return (
    <div data-testid="console-result" data-view={view.type} data-status={"status" in view ? view.status : undefined}>
      <p className="sr-only">{announce}</p>
      <div aria-live="off">
        <ResultBody view={view} onRetry={onRetry} />
      </div>
    </div>
  );
}

function ResultBody({ view, onRetry }: ConsoleResultProps) {
  switch (view.type) {
    case "idle":
      return <IdleResult />;
    case "pending":
      return <PendingResult status={view.status} label={view.label} />;
    case "notice":
      return (
        <Alert variant={view.tone} data-testid="console-notice">
          {view.tone === "warning" ? <TriangleAlertIcon aria-hidden /> : <CircleAlertIcon aria-hidden />}
          <AlertTitle>{view.title}</AlertTitle>
          <AlertDescription>
            <p>{view.message}</p>
            {view.href && (
              <p>
                {/* No prefetch: the submission page may not exist yet for a fresh id. */}
                <Link href={view.href} prefetch={false} className="inline-flex items-center gap-1">
                  Open submission
                  <ExternalLinkIcon aria-hidden className="size-3.5" />
                </Link>
              </p>
            )}
          </AlertDescription>
        </Alert>
      );
    case "run":
      return <RunResult view={view} onRetry={onRetry} />;
    case "custom":
      return <CustomResult view={view} onRetry={onRetry} />;
    case "submit":
      return <SubmitResult view={view} onRetry={onRetry} />;
  }
}

function IdleResult() {
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
      <p>Run your code to see results here.</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          Run <ShortcutKeys action="run" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          Submit <ShortcutKeys action="submit" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          Leave the editor <Kbd>Esc</Kbd> then <Kbd>Tab</Kbd>
        </span>
      </p>
    </div>
  );
}

function PendingResult({ status, label }: { status: "queued" | "running"; label: string }) {
  const v = VERDICTS[status];
  return (
    <div aria-busy="true" className="flex flex-col gap-3" data-testid="console-pending">
      <p className={cn("inline-flex items-center gap-2 text-[0.9375rem] font-semibold", v.text)}>
        {status === "queued" ? <ClockIcon aria-hidden className="size-4" /> : <VerdictIcon status="running" className="size-4" />}
        {label}
      </p>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-4/5" />
      </div>
    </div>
  );
}

/** Verdict heading: serif 22/28 in the verdict color + muted summary on the baseline. */
function ResultHeader({ status, summary }: { status: Parameters<typeof VerdictLabel>[0]["status"]; summary?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <VerdictLabel status={status} />
      {summary && (
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="result-summary">
          {summary}
        </span>
      )}
    </div>
  );
}

export function Value({ label, value, wrong = false, testId }: { label: string; value?: ValueView; wrong?: boolean; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div
        data-testid={testId}
        className={cn(valueBlockClasses, wrong && "border-danger/40 bg-danger-bg")}
      >
        {value ? value.text : <span className="text-muted-foreground">No value</span>}
      </div>
      {value?.truncated && <TruncatedHint />}
    </div>
  );
}

function TruncatedHint() {
  return <span className="text-xs text-muted-foreground">… (truncated)</span>;
}

export function InputBlock({ input }: { input: InputView }) {
  if (input.kind === "raw") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Input</span>
        <div className={valueBlockClasses}>{input.text}</div>
        {input.truncated && <TruncatedHint />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">Input</span>
      <div className={cn(valueBlockClasses, "flex flex-col gap-0.5")}>
        {input.params.map((p) => (
          <span key={p.name}>
            <span className="text-muted-foreground">{p.name} =</span> {p.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** `label` may be left out when a surrounding heading already names the block. */
export function TextBlock({ label, text, tone }: { label?: string; text: string; tone?: "runtime" | "compile" }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-semibold text-muted-foreground">{label}</span>}
      <pre
        className={cn(
          "max-h-64 overflow-auto rounded-md border px-3 py-2 font-mono text-[13px]/5 whitespace-pre-wrap break-words",
          tone === "runtime" && "border-danger/30 bg-danger-bg text-verdict-runtime",
          tone === "compile" && "border-danger/30 bg-danger-bg text-verdict-compile",
          !tone && "bg-surface-sunken text-foreground",
        )}
        data-testid={tone ? "result-error" : "result-stdout"}
      >
        {text}
      </pre>
    </div>
  );
}

function errorTone(status: string): "runtime" | "compile" {
  return status === "compile_error" ? "compile" : "runtime";
}

function Explanation({ text, onRetry, retry }: { text: string | null; onRetry?: () => void; retry?: boolean }) {
  if (!text) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-foreground-secondary">{text}</p>
      {retry && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCwIcon aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

function CaseStatusIcon({ status }: { status: CaseView["status"] }) {
  const meta = CASE_STATUSES[status];
  const Icon = meta.icon;
  return <Icon aria-hidden className={cn("size-3.5", meta.text)} />;
}

function RunResult({ view, onRetry }: { view: Extract<ResultView, { type: "run" }>; onRetry?: () => void }) {
  const [selected, setSelected] = useState(0);
  const caseIndex = Math.min(selected, Math.max(view.cases.length - 1, 0));
  const current = view.cases[caseIndex];
  const summary = view.cases.length > 0 ? `${view.summary}${view.timeMs !== null ? ` · ${formatMs(view.timeMs)}` : ""}` : undefined;
  return (
    <div className="flex flex-col gap-4" data-testid="run-result">
      <ResultHeader status={view.status} summary={summary} />
      <Explanation text={view.explanation} onRetry={onRetry} retry={view.status === "internal_error"} />
      {view.error && <TextBlock label={view.status === "compile_error" ? "Compile error" : "Error"} text={view.error} tone={errorTone(view.status)} />}
      {view.cases.length > 0 && (
        <>
          <div role="group" aria-label="Sample case results" className="flex flex-wrap gap-2">
            {view.cases.map((c, i) => (
              <button
                key={c.index}
                type="button"
                aria-pressed={i === caseIndex}
                className={pillClasses(i === caseIndex)}
                onClick={() => setSelected(i)}
                data-testid={`case-pill-${i}`}
                data-case-status={c.status}
              >
                <CaseStatusIcon status={c.status} />
                {c.label}
                <span className="sr-only">: {CASE_STATUSES[c.status].label}</span>
              </button>
            ))}
          </div>
          {current && <CaseDetail item={current} />}
        </>
      )}
      {view.stdout && <TextBlock label="Stdout" text={view.stdout} />}
    </div>
  );
}

function CaseDetail({ item }: { item: CaseView }) {
  const meta = CASE_STATUSES[item.status];
  return (
    <div className="flex flex-col gap-3" data-testid="case-detail">
      <p className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", meta.text)}>
        <CaseStatusIcon status={item.status} />
        {meta.label}
        {item.timeMs !== undefined && (
          <span className="font-normal text-muted-foreground tabular-nums">· {formatMs(item.timeMs)}</span>
        )}
      </p>
      <InputBlock input={item.input} />
      <div className="grid gap-3 min-[520px]:grid-cols-2">
        <Value label="Output" value={item.output} wrong={item.outputWrong && item.output !== undefined} testId="case-output" />
        {item.expected !== undefined && <Value label="Expected" value={item.expected} testId="case-expected" />}
      </div>
      {item.error && <TextBlock label="Error" text={item.error} tone="runtime" />}
    </div>
  );
}

function CustomResult({ view, onRetry }: { view: Extract<ResultView, { type: "custom" }>; onRetry?: () => void }) {
  const ok = view.status === "accepted";
  return (
    <div className="flex flex-col gap-4" data-testid="custom-result">
      {ok ? (
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="text-[1.0625rem]/6 font-semibold text-foreground">Output</h3>
          {view.timeMs !== null && (
            <span className="text-sm text-muted-foreground tabular-nums">{formatMs(view.timeMs)}</span>
          )}
        </div>
      ) : (
        <ResultHeader status={view.status} />
      )}
      <Explanation text={view.explanation} onRetry={onRetry} retry={view.status === "internal_error"} />
      {view.error && <TextBlock label={view.status === "compile_error" ? "Compile error" : "Error"} text={view.error} tone={errorTone(view.status)} />}
      {view.input && <InputBlock input={view.input} />}
      {ok && <Value label="Return value" value={view.output ?? undefined} testId="custom-output" />}
      {view.stdout && <TextBlock label="Stdout" text={view.stdout} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-32 rounded-md border bg-surface-sunken p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function SubmitResult({ view, onRetry }: { view: Extract<ResultView, { type: "submit" }>; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-4" data-testid="submit-result">
      <ResultHeader
        status={view.status}
        summary={view.status === "internal_error" || view.status === "compile_error" ? undefined : view.summary}
      />
      {view.status !== "internal_error" && view.status !== "compile_error" && (
        <div className="flex flex-wrap gap-2">
          <Metric label="Runtime" value={formatMs(view.runtimeMs)} />
          <Metric label="Memory" value={formatMemory(view.memoryKb)} />
        </div>
      )}
      <Explanation text={view.explanation} onRetry={onRetry} retry={view.status === "internal_error"} />
      {view.failedOn && view.status === "wrong_answer" && (
        <p className="text-sm font-semibold text-foreground">{view.failedOn}</p>
      )}
      {view.error && <TextBlock label={view.status === "compile_error" ? "Compile error" : "Error"} text={view.error} tone={errorTone(view.status)} />}
      {view.failedCase && (
        <div className="flex flex-col gap-3" data-testid="failed-case">
          <InputBlock input={view.failedCase.input} />
          <div className="grid gap-3 min-[520px]:grid-cols-2">
            <Value label="Output" value={view.failedCase.output} wrong testId="failed-output" />
            <Value label="Expected" value={view.failedCase.expected} testId="failed-expected" />
          </div>
        </div>
      )}
      {view.stdout && <TextBlock label="Stdout" text={view.stdout} />}
    </div>
  );
}
