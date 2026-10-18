"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { JUDGE_DISABLED_SHORT } from "@/lib/judge-availability";
import type { Signature } from "@/lib/problems/schema";
import { pollSubmission, startRun, startSubmit } from "@/lib/submission-client";
import { isFinalStatus, LANGUAGES, type Language, type PollingConfig } from "@/lib/submission-dto";
import { MONACO_TAB_SIZE } from "@/lib/monaco-themes";
import { generateTemplate } from "@/lib/templates";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import { buffersReducer, currentCode, initBuffers, type Buffers } from "@/lib/workspace/buffers";
import {
  customInputSummary,
  fieldsFromInput,
  parseCustomInput,
  type CustomInputFields,
} from "@/lib/workspace/custom-input";
import {
  busyAction,
  IDLE,
  isBusy,
  stateFromPoll,
  stateFromStartError,
  toResultView,
  type JudgeAction,
  type JudgeState,
} from "@/lib/workspace/judge-state";
import {
  clearPending,
  getBrowserStorage,
  loadDraft,
  loadLanguage,
  loadPending,
  saveDraft,
  saveLanguage,
  savePending,
} from "@/lib/workspace/storage";

import type { CodeEditorHandle } from "./code-editor";
import { ConsolePane, type ConsoleTab } from "./console-pane";
import { ConsoleResult } from "./console-result";
import { ConsoleTestcase, type TestMode } from "./console-testcase";
import { EditorPane } from "./editor-pane";
import { EditorToolbar, RunSubmitButtons } from "./editor-toolbar";
import { JudgeDisabledBarNote } from "./judge-disabled-note";
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query";
import { SessionSubmitNote, SESSION_SUBMIT_CODES, type SessionSubmitIssue } from "./session-submit-note";
import { OWN_SUBMIT_FINAL_EVENT, useSubmitSession } from "./submit-context";
import { ProblemWorkspace, type MobileTab } from "./workspace";

const LazyCodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

const DRAFT_DEBOUNCE_MS = 500;

export type SolveWorkspaceProps = {
  slug: string;
  signature: Signature;
  /** Languages the problem offers (`problems.languages`); others are not selectable. */
  languages: readonly Language[];
  /** `problems.wide_ints`: int positions the Java template declares `long`. */
  wideInts: readonly string[];
  samples: { input: Record<string, unknown>; expected: unknown }[];
  signedIn: boolean;
  pollingConfig: PollingConfig;
  /** False: this deployment runs no code (JUDGE_ENABLED); Run / Submit are off, editing still works. */
  judgeEnabled: boolean;
  description: ReactNode;
  submissions: ReactNode;
  /** Community C1: the Discussion tab, its count label and the mobile link (absent while the flag is off). */
  discussion?: ReactNode;
  discussionLabel?: ReactNode;
  discussionMobile?: ReactNode;
};

/**
 * The interactive problem page (M5, DESIGN.md §9.4): Monaco with per-language
 * buffers and local drafts, Run / Submit with polling, and the console.
 * Renders into the slots of `ProblemWorkspace`; all state lives here so a
 * desktop ↔ mobile layout switch (which remounts the slots) loses nothing.
 */
export function SolveWorkspace({
  slug,
  signature,
  languages,
  wideInts,
  samples,
  signedIn,
  pollingConfig,
  judgeEnabled,
  description,
  submissions,
  discussion,
  discussionLabel,
  discussionMobile,
}: SolveWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useMediaQuery(DESKTOP_QUERY);

  // --- Code buffers + drafts (AC-M5-1, AC-M5-2) -------------------------
  const templates = useMemo<Buffers>(
    () => ({
      python: generateTemplate(signature, "python"),
      javascript: generateTemplate(signature, "javascript"),
      java: generateTemplate(signature, "java", { wideInts }),
    }),
    [signature, wideInts],
  );
  // Lazy init reads localStorage on the client. Nothing state-dependent is
  // rendered during SSR / hydration (the workspace shows a static fallback
  // until the viewport is known), so this cannot cause a mismatch.
  const [buffers, dispatch] = useReducer(buffersReducer, null, () => {
    const local = getBrowserStorage("local");
    return initBuffers(
      templates,
      Object.fromEntries(LANGUAGES.map((l) => [l, loadDraft(local, slug, l)])),
      loadLanguage(local, slug),
      languages,
    );
  });
  const language = buffers.language;
  const code = currentCode(buffers);
  const [saved, setSaved] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editorHandle = useRef<CodeEditorHandle | null>(null);
  const dirtyRef = useRef(false);

  // Debounced autosave. A pending write is flushed when the language changes,
  // the page is hidden or left, and on unmount, so no keystrokes are lost.
  const latestRef = useRef({ slug, language, code });
  const pendingSaveRef = useRef(false);
  useEffect(() => {
    latestRef.current = { slug, language, code };
  }, [slug, language, code]);
  const flushDraft = useCallback(() => {
    if (!pendingSaveRef.current) return;
    pendingSaveRef.current = false;
    const latest = latestRef.current;
    setSaved(saveDraft(getBrowserStorage("local"), latest.slug, latest.language, latest.code));
  }, []);
  useEffect(() => {
    if (!dirtyRef.current) return;
    pendingSaveRef.current = true;
    const timer = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [language, code, flushDraft]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    window.addEventListener("pagehide", flushDraft);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      document.removeEventListener("visibilitychange", onHide);
      flushDraft();
    };
  }, [flushDraft]);

  const onCodeChange = useCallback((next: string) => {
    dirtyRef.current = true;
    setSaved(false);
    dispatch({ type: "edit", code: next });
  }, []);

  const onLanguageChange = useCallback(
    (next: Language) => {
      flushDraft();
      dispatch({ type: "select", language: next });
      saveLanguage(getBrowserStorage("local"), slug, next);
    },
    [slug, flushDraft],
  );

  const onReset = useCallback(() => {
    const template = buffers.templates[language];
    dirtyRef.current = true;
    dispatch({ type: "reset" });
    // The model keeps its own text; push the template into it as an undoable edit.
    editorHandle.current?.replaceAll(template);
    toast.success("Code reset to the starter template");
  }, [buffers.templates, language]);

  const onCursorChange = useCallback((line: number, column: number) => setCursor({ line, column }), []);

  // --- Testcase tab (AC-M5-4) -------------------------------------------
  const [testMode, setTestMode] = useState<TestMode>("samples");
  const [selectedSample, setSelectedSample] = useState(0);
  const [customFields, setCustomFields] = useState<CustomInputFields>(() =>
    fieldsFromInput(signature, samples[0]?.input ?? {}),
  );
  const customValidation = useMemo(() => parseCustomInput(signature, customFields), [signature, customFields]);
  const runBlockedReason = testMode === "custom" ? customInputSummary(customValidation) : null;

  const onUseSample = useCallback(
    (index: number) => {
      setCustomFields(fieldsFromInput(signature, samples[index]?.input ?? {}));
      setTestMode("custom");
    },
    [signature, samples],
  );

  // --- Run / Submit (AC-M5-3, -5, -6, -10) ------------------------------
  const [judge, setJudge] = useState<JudgeState>(IDLE);
  // Also set when the server answers 503 `judge_disabled` to a page that thought otherwise.
  const [judgeOff, setJudgeOff] = useState(!judgeEnabled);
  // Judge off: open on Result, whose idle state explains why Run / Submit are off.
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>(judgeEnabled ? "testcase" : "result");
  const [mobileTab, setMobileTab] = useState<MobileTab>("description");
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const paramOrder = useMemo(() => signature.params.map((p) => p.name), [signature]);

  // --- Room session context of Submit (Rooms §3.4; only Submit, never Run) --
  const roomSession = useSubmitSession();
  const [sessionIssue, setSessionIssue] = useState<SessionSubmitIssue | null>(null);
  /** Whether the latest Submit was sent with the session id (null: none yet). */
  const [lastSubmitCounted, setLastSubmitCounted] = useState<boolean | null>(null);

  const loginHref = `/login?next=${encodeURIComponent(pathname || `/problems/${slug}`)}`;

  const poll = useCallback(
    async (id: string, action: JudgeAction, custom: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      setJudge({ phase: "pending", action, custom, id, status: "queued" });
      const result = await pollSubmission(id, {
        config: pollingConfig,
        signal: controller.signal,
        onUpdate: (dto) => {
          if (isFinalStatus(dto.status)) return;
          const status = dto.status;
          setJudge((prev) =>
            prev.phase === "pending" && prev.id === id && prev.status !== status ? { ...prev, status } : prev,
          );
        },
      });
      const next = stateFromPoll(action, custom, result);
      if (!next) return; // Aborted (unmount or a newer poll).
      busyRef.current = false;
      clearPending(getBrowserStorage("session"), slug);
      if (next.phase === "failed" && next.status === 401) {
        router.push(loginHref);
        return;
      }
      setJudge(next);
      if (next.phase === "failed") toast.error(next.message);
      // A finished Submit changes the problem's status (solved / attempted):
      // re-render the server parts; client state (editor, console) is kept.
      if (next.phase === "done" && next.submission.kind === "submit") {
        router.refresh();
        window.dispatchEvent(new Event(OWN_SUBMIT_FINAL_EVENT));
      }
    },
    [pollingConfig, router, slug, loginHref],
  );

  // Resume a submission that was still pending when the page was reloaded (AC-M5-6).
  useEffect(() => {
    const pending = loadPending(getBrowserStorage("session"), slug);
    if (pending && signedIn && judgeEnabled) {
      // Defer out of the effect body: `poll` sets state.
      queueMicrotask(() => {
        setConsoleTab("result");
        void poll(pending.id, pending.kind, pending.custom);
      });
    }
    return () => abortRef.current?.abort();
  }, [slug, signedIn, judgeEnabled, poll]);

  const start = useCallback(
    async (action: JudgeAction, options: { withoutSession?: boolean } = {}) => {
      if (judgeOff) {
        // Shortcuts land here (the buttons are disabled): say why, send nothing.
        setConsoleTab("result");
        toast(JUDGE_DISABLED_SHORT, { id: "judge-disabled" });
        return;
      }
      if (!signedIn) {
        router.push(loginHref);
        return;
      }
      if (busyRef.current) return;
      const custom = action === "run" && testMode === "custom";
      if (custom && !customValidation.ok) {
        setConsoleTab("testcase");
        toast.error(customInputSummary(customValidation) ?? "Fix the custom input first");
        return;
      }
      busyRef.current = true;
      setConsoleTab("result");
      setJudge({ phase: "starting", action, custom });
      const body = { language, code };
      const sessionId = action === "submit" && !options.withoutSession ? (roomSession?.roomSessionId ?? null) : null;
      if (action === "submit") setSessionIssue(null);
      const result =
        action === "run"
          ? await startRun(slug, custom && customValidation.ok ? { ...body, customInput: customValidation.input } : body)
          : await startSubmit(slug, sessionId ? { ...body, roomSessionId: sessionId } : body);
      if (!result.ok) {
        busyRef.current = false;
        if (result.status === 401) {
          router.push(loginHref);
          return;
        }
        const failed = stateFromStartError(action, result);
        setJudge(failed);
        if (failed.phase === "judge_disabled") {
          // Not an error: the deployment runs no code. Explained in the console, no toast, no retry.
          setJudgeOff(true);
          return;
        }
        if (sessionId && result.code && SESSION_SUBMIT_CODES.has(result.code)) {
          // Explained with its actions in the console, no toast.
          setSessionIssue({ code: result.code, message: result.error });
          return;
        }
        if (failed.phase === "failed") toast.error(failed.message);
        return;
      }
      if (action === "submit") setLastSubmitCounted(sessionId !== null);
      savePending(getBrowserStorage("session"), slug, { id: result.id, kind: action, custom });
      await poll(result.id, action, custom);
    },
    [judgeOff, signedIn, router, loginHref, testMode, customValidation, language, code, slug, poll, roomSession],
  );

  const startFromBar = useCallback(
    (action: JudgeAction) => {
      // Mobile: show the console tab, where the result appears.
      setMobileTab("console");
      void start(action);
    },
    [start],
  );

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  const shortcuts = useCallback(
    () => ({ onRun: () => void startRef.current("run"), onSubmit: () => void startRef.current("submit") }),
    [],
  );

  const busy = isBusy(judge);
  const runSubmit = {
    busyAction: busyAction(judge),
    disabled: busy,
    runBlockedReason,
    unavailableReason: judgeOff ? JUDGE_DISABLED_SHORT : null,
    onRun: () => void start("run"),
    onSubmit: () => void start("submit"),
  };

  const view = toResultView(judge, paramOrder, { judgeEnabled: !judgeOff });
  const retryAction: JudgeAction | null =
    judgeOff || judge.phase === "idle" || judge.phase === "starting" || judge.phase === "pending"
      ? null
      : judge.phase === "done"
        ? judge.submission.kind
        : judge.action;

  return (
    <ProblemWorkspace
      description={description}
      submissions={submissions}
      discussion={discussion}
      discussionLabel={discussionLabel}
      discussionMobile={discussionMobile}
      mobileTab={mobileTab}
      onMobileTabChange={setMobileTab}
      editor={
        <EditorPane
          toolbar={
            <EditorToolbar
              language={language}
              languages={languages}
              onLanguageChange={onLanguageChange}
              onReset={onReset}
              showRunSubmit={desktop !== false}
              {...runSubmit}
            />
          }
          statusBar={
            <>
              <span className="tabular-nums" data-testid="cursor-position">
                Ln {cursor.line}, Col {cursor.column}
              </span>
              <span className="max-sm:hidden">{LANGUAGE_LABELS[language]}</span>
              <span className="max-sm:hidden">Spaces: {MONACO_TAB_SIZE[language]}</span>
              <span className="ml-auto" data-testid="draft-status">
                {saved ? "Saved locally" : ""}
              </span>
            </>
          }
        >
          <LazyCodeEditor
            slug={slug}
            language={language}
            value={code}
            onChange={onCodeChange}
            onCursorChange={onCursorChange}
            shortcuts={shortcuts}
            handleRef={editorHandle}
          />
        </EditorPane>
      }
      console={
        <div className="h-full">
          <ConsolePane
            tab={consoleTab}
            onTabChange={setConsoleTab}
            testcase={
              <ConsoleTestcase
                signature={signature}
                samples={samples}
                mode={testMode}
                onModeChange={setTestMode}
                selectedSample={selectedSample}
                onSelectSample={setSelectedSample}
                fields={customFields}
                onFieldChange={(name, text) => setCustomFields((prev) => ({ ...prev, [name]: text }))}
                onUseSample={onUseSample}
                validation={customValidation}
              />
            }
            result={
              <>
                <SessionSubmitNote
                  session={roomSession}
                  issue={sessionIssue}
                  lastSubmitCounted={judge.phase === "idle" ? null : lastSubmitCounted}
                  busy={busy}
                  onSubmitWithoutSession={() => void start("submit", { withoutSession: true })}
                />
                <ConsoleResult view={view} onRetry={retryAction ? () => void start(retryAction) : undefined} />
              </>
            }
          />
        </div>
      }
      footer={
        desktop === false ? (
          <div className="flex flex-col gap-2">
            {judgeOff && <JudgeDisabledBarNote />}
            <div className="flex gap-2">
              <RunSubmitButtons
                {...runSubmit}
                variant="bar"
                onRun={() => startFromBar("run")}
                onSubmit={() => startFromBar("submit")}
              />
            </div>
          </div>
        ) : undefined
      }
    />
  );
}

function EditorSkeleton() {
  return (
    <div aria-busy="true" className="flex h-full gap-3 p-3">
      <span className="sr-only">Loading the editor…</span>
      <Skeleton className="h-full w-8" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}
