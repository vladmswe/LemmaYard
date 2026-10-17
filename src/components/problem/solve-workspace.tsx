"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import type { Signature } from "@/lib/problems/schema";
import { pollSubmission, startRun, startSubmit } from "@/lib/submission-client";
import { isFinalStatus, LANGUAGES, type Language, type PollingConfig } from "@/lib/submission-dto";
import { generateTemplate } from "@/lib/templates";
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
import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query";
import { ProblemWorkspace, type MobileTab } from "./workspace";

const LazyCodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

const DRAFT_DEBOUNCE_MS = 500;

export type SolveWorkspaceProps = {
  slug: string;
  signature: Signature;
  samples: { input: Record<string, unknown>; expected: unknown }[];
  signedIn: boolean;
  pollingConfig: PollingConfig;
  description: ReactNode;
  submissions: ReactNode;
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
  samples,
  signedIn,
  pollingConfig,
  description,
  submissions,
}: SolveWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useMediaQuery(DESKTOP_QUERY);

  // --- Code buffers + drafts (AC-M5-1, AC-M5-2) -------------------------
  const templates = useMemo<Buffers>(
    () => ({
      python: generateTemplate(signature, "python"),
      javascript: generateTemplate(signature, "javascript"),
    }),
    [signature],
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
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("testcase");
  const [mobileTab, setMobileTab] = useState<MobileTab>("description");
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const paramOrder = useMemo(() => signature.params.map((p) => p.name), [signature]);

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
      if (next.phase === "done" && next.submission.kind === "submit") router.refresh();
    },
    [pollingConfig, router, slug, loginHref],
  );

  // Resume a submission that was still pending when the page was reloaded (AC-M5-6).
  useEffect(() => {
    const pending = loadPending(getBrowserStorage("session"), slug);
    if (pending && signedIn) {
      // Defer out of the effect body: `poll` sets state.
      queueMicrotask(() => {
        setConsoleTab("result");
        void poll(pending.id, pending.kind, pending.custom);
      });
    }
    return () => abortRef.current?.abort();
  }, [slug, signedIn, poll]);

  const start = useCallback(
    async (action: JudgeAction) => {
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
      const result =
        action === "run"
          ? await startRun(slug, custom && customValidation.ok ? { ...body, customInput: customValidation.input } : body)
          : await startSubmit(slug, body);
      if (!result.ok) {
        busyRef.current = false;
        if (result.status === 401) {
          router.push(loginHref);
          return;
        }
        const failed = stateFromStartError(action, result);
        setJudge(failed);
        if (failed.phase === "failed") toast.error(failed.message);
        return;
      }
      savePending(getBrowserStorage("session"), slug, { id: result.id, kind: action, custom });
      await poll(result.id, action, custom);
    },
    [signedIn, router, loginHref, testMode, customValidation, language, code, slug, poll],
  );

  const startFromBar = useCallback(
    (action: JudgeAction) => {
      // Mobile: show the console where the result appears.
      setMobileTab("code");
      requestAnimationFrame(() => consoleRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
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
    onRun: () => void start("run"),
    onSubmit: () => void start("submit"),
  };

  const view = toResultView(judge, paramOrder);
  const retryAction: JudgeAction | null =
    judge.phase === "done" ? judge.submission.kind : judge.phase === "idle" || judge.phase === "starting" || judge.phase === "pending" ? null : judge.action;

  return (
    <ProblemWorkspace
      description={description}
      submissions={submissions}
      mobileTab={mobileTab}
      onMobileTabChange={setMobileTab}
      editor={
        <EditorPane
          toolbar={
            <EditorToolbar
              language={language}
              onLanguageChange={onLanguageChange}
              onReset={onReset}
              showRunSubmit={desktop !== false}
              {...runSubmit}
            />
          }
          statusBar={
            <>
              <span data-testid="draft-status">{saved ? "Saved locally" : ""}</span>
              <span className="tabular-nums" data-testid="cursor-position">
                Ln {cursor.line}, Col {cursor.column}
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
        <div ref={consoleRef} className="h-full scroll-mt-14">
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
              <ConsoleResult view={view} onRetry={retryAction ? () => void start(retryAction) : undefined} />
            }
          />
        </div>
      }
      footer={
        desktop === false ? (
          <div className="flex gap-2">
            <RunSubmitButtons
              {...runSubmit}
              variant="bar"
              onRun={() => startFromBar("run")}
              onSubmit={() => startFromBar("submit")}
            />
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
