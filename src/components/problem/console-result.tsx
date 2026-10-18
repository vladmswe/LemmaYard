"use client";

import { CircleAlertIcon, ExternalLinkIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "cn";

import { Qed } from "@/components/brand/qed";
import { QedLoader } from "@/components/brand/qed-loader";
import { VerdictLabel } from "@/components/judge/verdict-badge";
import { CASE_STATUSES, VERDICTS } from "@/components/judge/verdict";
import { squaresFromCounts, TestSquares, type TestSquareState } from "@/components/judge/test-squares";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/tooltip";
import type { FinalStatus } from "@/lib/submission-dto";
import {
  formatMemory,
  formatMs,
  type CaseView,
  type InputView,
  type ResultView,
  type ValueView,
} from "@/lib/workspace/judge-state";

import { ioLabelClasses, pillClasses, valueBlockClasses } from "./console-testcase";
import { JudgeDisabledNotice } from "./judge-disabled-note";
import { ShortcutKeys } from "./editor-toolbar";

export type ConsoleResultProps = {
  view: ResultView;
  /** "Try again" on Internal Error / judge unavailable. */
  onRetry?: () => void;
};

/**
 * Result tab body (DESIGN.md §13.4). The pane's `aria-live` region would
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
    case "judge_disabled":
      return <JudgeDisabledNotice message={view.message} />;
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
    <div className="flex flex-col gap-3 text-sm text-muted-foreground" data-testid="console-idle">
      <p className="flex items-center gap-2.5">
        <Qed size={10} open className="shrink-0" />
        Run your code to see results here.
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
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

/** Queued / running: the ∎ loader (a static outline under reduced motion) + the label. */
function PendingResult({ status, label }: { status: "queued" | "running"; label: string }) {
  const v = VERDICTS[status];
  return (
    <div aria-busy="true" className="flex flex-col gap-4" data-testid="console-pending">
      <p className={cn("inline-flex items-center gap-3 font-mono text-[0.8125rem] font-medium", v.text)}>
        <QedLoader className="size-3.5" />
        {label}
      </p>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 w-full rounded-[8px]" />
        <div className="grid gap-2.5 min-[520px]:grid-cols-2">
          <Skeleton className="h-10 rounded-[8px]" />
          <Skeleton className="h-10 rounded-[8px]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Verdict row: icon + serif 34px word (∎ snap on Accepted), the mono
 * summary, then one test square per case on the right.
 */
function ResultHeader({
  status,
  summary,
  detail,
  squares,
}: {
  status: FinalStatus;
  summary?: string;
  /** Second part of the mono line ("Failed on test 8 of 15"). */
  detail?: string | null;
  squares?: TestSquareState[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 motion-safe:animate-enter-fade">
      <h3 className="flex items-center">
        <VerdictLabel status={status} size="lg" />
        {status === "accepted" && <Qed size={9} snap delayMs={120} className="mb-1.5 ml-2 self-end" />}
      </h3>
      {summary && (
        <p className="font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
          <span data-testid="result-summary">{summary}</span>
          {detail && (
            // Below 640px the failed case repeats it as its own line.
            <span className="max-sm:hidden">
              <span aria-hidden> · </span>
              {detail}
            </span>
          )}
        </p>
      )}
      {squares && squares.length > 0 && (
        <TestSquares results={squares} animate className="max-w-full sm:ml-auto" />
      )}
    </div>
  );
}

/** Mono chips under the verdict: runtime, memory, time. */
function MetricChips({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-wrap gap-2" data-testid="result-metrics">
      {items.map((m) => (
        <div
          key={m.label}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-border-strong px-3 font-mono text-[0.8125rem]"
        >
          <dt className="label-mono text-[0.6875rem] text-muted-foreground">{m.label}</dt>
          <dd className={cn("tabular-nums", m.value === "—" ? "text-muted-foreground" : "text-foreground")}>{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IoLabel({ children }: { children: ReactNode }) {
  return <span className={ioLabelClasses}>{children}</span>;
}

export function Value({ label, value, wrong = false, testId }: { label: string; value?: ValueView; wrong?: boolean; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <IoLabel>{label}</IoLabel>
      <div
        data-testid={testId}
        className={cn(
          valueBlockClasses,
          wrong && "border-verdict-wrong/35 bg-verdict-wrong-bg text-verdict-wrong",
        )}
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
      <div className="flex flex-col gap-1.5">
        <IoLabel>Input</IoLabel>
        <div className={valueBlockClasses}>{input.text}</div>
        {input.truncated && <TruncatedHint />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <IoLabel>Input</IoLabel>
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

/**
 * Stdout or an error text. Errors are a mono block in the verdict's tint with
 * a 2px rule in its colour (≤ 8 KB from the judge; scrolls past 16rem).
 * `label` may be left out when a surrounding heading already names the block.
 */
export function TextBlock({ label, text, tone }: { label?: string; text: string; tone?: "runtime" | "compile" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <IoLabel>{label}</IoLabel>}
      <pre
        className={cn(
          "max-h-64 overflow-auto rounded-[8px] border px-3 py-2 font-mono text-[0.8125rem]/[1.6] whitespace-pre-wrap break-words md:text-sm/[1.6]",
          tone === "runtime" && "border-verdict-runtime/30 border-l-2 border-l-verdict-runtime bg-verdict-runtime-bg text-verdict-runtime",
          tone === "compile" && "border-verdict-compile/30 border-l-2 border-l-verdict-compile bg-verdict-compile-bg text-verdict-compile",
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

function errorLabel(status: string): string {
  return status === "compile_error" ? "Compile error" : "Error";
}

function Explanation({ text, onRetry, retry }: { text: string | null; onRetry?: () => void; retry?: boolean }) {
  if (!text) return null;
  return (
    <div className="flex flex-col items-start gap-2.5">
      <p className="max-w-[72ch] text-[0.9375rem] text-foreground-secondary">{text}</p>
      {retry && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCwIcon aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

function caseSquare(status: CaseView["status"]): TestSquareState {
  return status === "passed" ? "pass" : status === "not_run" ? "pending" : "fail";
}

/** The small glyph inside a case pill: green square / red diamond / outline. */
function CaseGlyph({ status }: { status: CaseView["status"] }) {
  const state = caseSquare(status);
  return (
    <i
      aria-hidden
      className={cn(
        "block size-2 shrink-0",
        state === "pass" && "bg-verdict-accepted",
        state === "fail" && "scale-90 rotate-45 bg-verdict-wrong",
        state === "pending" && "border-[1.5px] border-border-strong",
      )}
    />
  );
}

function RunResult({ view, onRetry }: { view: Extract<ResultView, { type: "run" }>; onRetry?: () => void }) {
  // Start on the first failing case: that is the one to look at.
  const firstFail = view.cases.findIndex((c) => caseSquare(c.status) === "fail");
  const [selected, setSelected] = useState<number | null>(null);
  const caseIndex = Math.min(selected ?? Math.max(firstFail, 0), Math.max(view.cases.length - 1, 0));
  const current = view.cases[caseIndex];
  const metrics = view.timeMs !== null && view.status !== "compile_error" ? [{ label: "Time", value: formatMs(view.timeMs) }] : [];
  return (
    <div className="flex flex-col gap-4" data-testid="run-result">
      <ResultHeader
        status={view.status}
        summary={view.cases.length > 0 ? view.summary : undefined}
        squares={view.cases.map((c) => caseSquare(c.status))}
      />
      {metrics.length > 0 && view.cases.length > 0 && <MetricChips items={metrics} />}
      <Explanation text={view.explanation} onRetry={onRetry} retry={view.status === "internal_error"} />
      {view.error && <TextBlock label={errorLabel(view.status)} text={view.error} tone={errorTone(view.status)} />}
      {view.cases.length > 0 && (
        <>
          <div role="group" aria-label="Sample case results" className="flex flex-wrap gap-1.5">
            {view.cases.map((c, i) => (
              <button
                key={c.index}
                type="button"
                aria-pressed={i === caseIndex}
                className={pillClasses(i === caseIndex, caseSquare(c.status) === "fail" ? "fail" : null)}
                onClick={() => setSelected(i)}
                data-testid={`case-pill-${i}`}
                data-case-status={c.status}
              >
                <CaseGlyph status={c.status} />
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
  const Icon = meta.icon;
  return (
    <div className="flex flex-col gap-3" data-testid="case-detail">
      <p className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", meta.text)}>
        <Icon aria-hidden className="size-3.5" />
        {meta.label}
        {item.timeMs !== undefined && (
          <span className="font-mono text-[0.8125rem] font-normal text-muted-foreground tabular-nums">· {formatMs(item.timeMs)}</span>
        )}
      </p>
      <InputBlock input={item.input} />
      <div className="grid gap-3 min-[520px]:grid-cols-2">
        {item.expected !== undefined && <Value label="Expected" value={item.expected} testId="case-expected" />}
        <Value label="Your output" value={item.output} wrong={item.outputWrong && item.output !== undefined} testId="case-output" />
      </div>
      {item.error && <TextBlock label="Error" text={item.error} tone="runtime" />}
    </div>
  );
}

/** Custom-input Run: "Output" without a verdict word, unless the run failed. */
function CustomResult({ view, onRetry }: { view: Extract<ResultView, { type: "custom" }>; onRetry?: () => void }) {
  const ok = view.status === "accepted";
  return (
    <div className="flex flex-col gap-4" data-testid="custom-result">
      {ok ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-lg/7 font-semibold text-foreground">Output</h3>
          <span className="label-mono text-muted-foreground">Custom input · no expected answer</span>
        </div>
      ) : (
        <ResultHeader status={view.status} />
      )}
      {ok && view.timeMs !== null && <MetricChips items={[{ label: "Time", value: formatMs(view.timeMs) }]} />}
      <Explanation text={view.explanation} onRetry={onRetry} retry={view.status === "internal_error"} />
      {view.error && <TextBlock label={errorLabel(view.status)} text={view.error} tone={errorTone(view.status)} />}
      {view.input && <InputBlock input={view.input} />}
      {ok && <Value label="Return value" value={view.output ?? undefined} testId="custom-output" />}
      {view.stdout && <TextBlock label="Stdout" text={view.stdout} />}
    </div>
  );
}

function SubmitResult({ view, onRetry }: { view: Extract<ResultView, { type: "submit" }>; onRetry?: () => void }) {
  const counted = view.status !== "internal_error" && view.status !== "compile_error";
  return (
    <div className="flex flex-col gap-4" data-testid="submit-result">
      <ResultHeader
        status={view.status}
        summary={counted ? view.summary : undefined}
        detail={view.status === "wrong_answer" ? view.failedOn : null}
        squares={counted ? squaresFromCounts(view.passed, view.total, view.status !== "accepted") : undefined}
      />
      {counted && (
        <MetricChips
          items={[
            { label: "Runtime", value: formatMs(view.runtimeMs) },
            { label: "Memory", value: formatMemory(view.memoryKb) },
          ]}
        />
      )}
      <Explanation text={view.explanation} onRetry={onRetry} retry={view.status === "internal_error"} />
      {view.error && <TextBlock label={errorLabel(view.status)} text={view.error} tone={errorTone(view.status)} />}
      {view.failedCase && (
        <div className="flex flex-col gap-3" data-testid="failed-case">
          {view.failedOn && <p className="text-sm font-semibold text-foreground sm:hidden">{view.failedOn}</p>}
          <InputBlock input={view.failedCase.input} />
          <div className="grid gap-3 min-[520px]:grid-cols-2">
            <Value label="Expected" value={view.failedCase.expected} testId="failed-expected" />
            <Value label="Your output" value={view.failedCase.output} wrong testId="failed-output" />
          </div>
        </div>
      )}
      {view.stdout && <TextBlock label="Stdout" text={view.stdout} />}
    </div>
  );
}
