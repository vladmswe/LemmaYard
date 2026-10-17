"use client";

import { cn } from "cn";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type JSX,
  type KeyboardEvent,
} from "react";

import { VizFrameContext } from "@/components/guide/svg/VizSvg";
import type { CodeBundle, ElementId, Frame, Trace, VizModel } from "@/lib/guide/contracts";
import { playerReducer, initialPlayerState, type PlayerAction, type PlayerState } from "@/lib/guide/player/reducer";
import { parseStepParam, readPlayerParams, writePlayerParams } from "@/lib/guide/player/url";
import { useGuidePrefs, writePrefs } from "@/lib/guide/prefs";

import { CodePanel } from "./CodePanel";
import { MainControls, SecondaryControls, SPEEDS, type Speed } from "./Controls";
import { CounterStrip } from "./CounterStrip";
import { InputBar } from "./InputBar";
import { KeySteps } from "./KeySteps";
import { announcement, LiveRegion, StateDescription, StepCaption, stepLabel } from "./Narration";
import { PromptFeedback, PromptPanel } from "./PromptPanel";
import { Scrubber } from "./Scrubber";
import { StateTable } from "./StateTable";
import { useContainerWidth } from "./use-container-width";
import { useMediaQuery, useReducedMotion } from "./use-reduced-motion";

export interface RendererProps<S> {
  frame: Frame<S>;
  prev: Frame<S> | null; // previous frame, for enter/exit decisions
  width: number; // container width in CSS px (1 SVG unit = 1 px)
  motion: boolean; // false = no transitions
  hovered: ElementId | null;
  onHover(id: ElementId | null): void; // links two views of the same state
  mode: "full" | "thumb"; // thumb = key-steps strip, no interactivity, no ids in DOM
}

export interface TracePlayerProps<S, I> {
  playerId: string;
  model: VizModel<S, I>;
  Renderer: ComponentType<RendererProps<S>>;
  initialInput: I;
  initialTrace: Trace<S>;
  code?: CodeBundle;
  hint?: string;
  ops?: { id: string; label: string }[]; // optional op selector; the op id is part of I (structure decides)
  /** With `ops`: read and set the op inside the input (the structure decides where it lives). */
  opOf?(input: I): string;
  withOp?(input: I, opId: string): I;
  toTable?(state: S): { caption: string; columns: string[]; rows: (string | number)[][] };
  /** Enables the "Random" preset: builds an input from a fresh client-side seed. */
  randomInput?(seed: number): I;
}

type Cause = "manual" | "auto" | "scrub" | "silent";
type Feedback = { correct: boolean | null; explain: string } | null;

const TICK_MS = 1200;
const SCRUB_ANNOUNCE_MS = 300;
const URL_DEBOUNCE_MS = 250;

function sameInput(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const noopSubscribe = () => () => {};

function ignoredTarget(t: HTMLElement): boolean {
  return t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

export function TracePlayer<S, I>(props: TracePlayerProps<S, I>): JSX.Element {
  const { playerId, model, Renderer, initialInput, code, hint, ops, toTable } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const idPrefix = `player-${playerId}-${uid}`;
  const descId = `${idPrefix}-desc`;

  const [input, setInput] = useState<I>(initialInput);
  const [trace, setTrace] = useState<Trace<S>>(props.initialTrace);
  const [ps, setPs] = useState<PlayerState>(() => initialPlayerState(props.initialTrace.frames.length));
  const psRef = useRef(ps);
  const frames = trace.frames;
  const total = frames.length;
  const frame = frames[Math.min(ps.index, total - 1)] as Frame<S>;
  const prevFrame = ps.index > 0 ? (frames[ps.index - 1] as Frame<S>) : null;

  const prefs = useGuidePrefs();
  const reducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px)", false);
  // false in the server HTML and during hydration; tests wait for data-hydrated="true".
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const motion = prefs.motion === "on" || (prefs.motion === "system" && !reducedMotion);
  const speed: Speed = prefs.speed;

  const [live, setLive] = useState(() =>
    announcement(1, total, frames[0]?.phase ?? "", frames[0]?.narration ?? ""),
  );
  const [note, setNote] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [interacted, setInteracted] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<ElementId | null>(null);
  const [raw, setRaw] = useState(() => (model.input ? model.input.format(initialInput) : ""));
  const [inputError, setInputError] = useState<string | null>(null);
  const [keyStepsOpen, setKeyStepsOpen] = useState<boolean | null>(null);
  const [codeOpen, setCodeOpen] = useState<boolean | null>(null);
  const [focusNextTick, setFocusNextTick] = useState(0);

  const figureRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const urlArmed = useRef(false);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useContainerWidth(figureRef);

  const prompts = useMemo(() => frames.map((f) => f.prompt ?? null), [frames]);
  const opts = useMemo(() => ({ skipPrompts: prefs.skipPrompts, prompts }), [prefs.skipPrompts, prompts]);

  const sayStep = useCallback(
    (s: PlayerState, fs: readonly Frame<S>[]) => {
      const f = fs[s.index] as Frame<S>;
      setLive(announcement(s.index + 1, fs.length, f.phase, f.narration));
    },
    [],
  );

  /** Applies one reducer action and decides what the live region says. */
  const act = useCallback(
    (a: PlayerAction, cause: Cause = "manual") => {
      const before = psRef.current;
      const after = playerReducer(before, a, opts);
      if (after === before) return;
      psRef.current = after;
      setPs(after);
      if (cause !== "silent" && cause !== "auto") {
        urlArmed.current = true;
        setInteracted(true);
      }
      if (after.index !== before.index || after.pendingPrompt !== null) setFeedback(null);
      if (scrubTimer.current && cause !== "scrub") {
        clearTimeout(scrubTimer.current);
        scrubTimer.current = null;
      }
      if (after.pendingPrompt !== null && before.pendingPrompt === null) {
        const p = prompts[after.pendingPrompt];
        if (p) setLive(`Question: ${p.question}`);
        return;
      }
      if (cause === "silent") return;
      if (cause === "scrub") {
        if (scrubTimer.current) clearTimeout(scrubTimer.current);
        scrubTimer.current = setTimeout(() => {
          scrubTimer.current = null;
          sayStep(psRef.current, frames);
        }, SCRUB_ANNOUNCE_MS);
        return;
      }
      if (cause === "auto") {
        const stopped = before.playing && !after.playing;
        const phaseChanged = (frames[after.index] as Frame<S>).phase !== (frames[before.index] as Frame<S>).phase;
        if (stopped || phaseChanged) sayStep(after, frames);
        return;
      }
      if (a.type === "play") return; // autoplay start: stay quiet, announce on pause / phase change
      sayStep(after, frames);
    },
    [opts, prompts, frames, sayStep],
  );

  // Autoplay timer.
  useEffect(() => {
    if (!ps.playing) return;
    const t = setTimeout(() => act({ type: "tick" }, "auto"), TICK_MS / speed);
    return () => clearTimeout(t);
  }, [ps.playing, ps.index, speed, act]);

  // Focus "Next step" after a prompt was answered.
  useEffect(() => {
    if (focusNextTick > 0) nextRef.current?.focus();
  }, [focusNextTick]);

  const loadTrace = useCallback(
    (value: I, announce: boolean): boolean => {
      let next: Trace<S>;
      try {
        next = model.generate(value);
      } catch (e) {
        setInputError(`Could not build this example: ${(e as Error).message}`);
        return false;
      }
      const fresh = initialPlayerState(next.frames.length);
      psRef.current = fresh;
      setPs(fresh);
      setTrace(next);
      setInput(value);
      setInputError(null);
      setFeedback(null);
      if (model.input) setRaw(model.input.format(value));
      if (announce) setLive(`New example loaded, ${next.frames.length} steps`);
      return true;
    },
    [model],
  );

  const applyInput = useCallback(
    (value: I) => {
      urlArmed.current = true;
      setInteracted(true);
      setNote(null);
      loadTrace(value, true);
    },
    [loadTrace],
  );

  // Deep link: read ?step.<id>= and ?input.<id>= once after hydration.
  useEffect(() => {
    const params = readPlayerParams(window.location.search, playerId);
    if (params.step === null && params.input === null) return;
    let frameCount = psRef.current.frameCount;
    let bad = false;
    if (params.input !== null && model.input) {
      const r = params.input.length <= model.input.maxLength ? model.input.parse(params.input) : null;
      // The URL is external state, read once after hydration (the server never sees it).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (r && r.ok && loadTrace(r.value, false)) {
        frameCount = psRef.current.frameCount;
      } else {
        bad = true;
        setInputError(null);
      }
    }
    if (params.step !== null && !bad) {
      const idx = parseStepParam(params.step, frameCount);
      if (idx === null) bad = true;
      else act({ type: "seek", index: idx }, "silent");
    }
    if (bad) {
      act({ type: "first" }, "silent");
      setNote("Link step not found, showing step 1");
      setLive("Link step not found, showing step 1");
    }
    // Runs once on mount by design: later URL changes come from this player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL sync (replaceState, debounced; never the Next router).
  const inputText = model.input && !sameInput(input, initialInput) ? model.input.format(input) : null;
  const buildUrl = useCallback(
    (step: number, inputValue: string | null) =>
      `${window.location.pathname}${writePlayerParams(window.location.search, playerId, { step, input: inputValue })}${window.location.hash}`,
    [playerId],
  );
  useEffect(() => {
    if (!urlArmed.current) return;
    const t = setTimeout(() => {
      window.history.replaceState(null, "", buildUrl(ps.index + 1, inputText));
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [ps.index, inputText, buildUrl]);

  const copyLink = useCallback(async () => {
    const url = buildUrl(psRef.current.index + 1, inputText);
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLive("Link copied");
    } catch {
      setLive("Could not copy the link; copy it from the address bar");
    }
  }, [buildUrl, inputText]);

  const togglePlay = useCallback(() => {
    act(psRef.current.playing ? { type: "pause" } : { type: "play" });
  }, [act]);

  const changeSpeed = useCallback(
    (dir: 1 | -1) => {
      const i = SPEEDS.indexOf(speed);
      const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + dir))] as Speed;
      if (next !== speed) {
        writePrefs({ speed: next });
        setLive(`Speed ${next}×`);
      }
    },
    [speed],
  );

  const reset = useCallback(() => {
    setNote(null);
    if (sameInput(input, initialInput)) {
      urlArmed.current = true;
      act({ type: "first" });
    } else {
      applyInput(initialInput);
    }
  }, [act, applyInput, input, initialInput]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (ignoredTarget(t)) return;
    const inWidget = t.closest('[role="tablist"], [role="radiogroup"]') !== null;
    const onFigure = t === figureRef.current;
    let handled = true;
    switch (e.key) {
      case "ArrowRight":
        if (inWidget) return;
        act({ type: "next" });
        break;
      case "ArrowLeft":
        if (inWidget) return;
        act({ type: "prev" });
        break;
      case "Home":
        if (inWidget) return;
        act({ type: "first" });
        break;
      case "End":
        if (inWidget) return;
        act({ type: "last" });
        break;
      case " ":
        if (!onFigure) return; // buttons keep their native Space behaviour
        togglePlay();
        break;
      case "k":
      case "K":
        togglePlay();
        break;
      case "+":
      case "=":
        changeSpeed(1);
        break;
      case "-":
      case "_":
        changeSpeed(-1);
        break;
      case "r":
      case "R":
        reset();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const pendingPrompt = ps.pendingPrompt !== null ? prompts[ps.pendingPrompt] : null;
  const table = toTable && showTable ? toTable(frame.state) : null;
  const frameCtx = useMemo(() => ({ descId, hidden: showTable }), [descId, showTable]);
  const opValue = ops && props.opOf ? props.opOf(input) : null;

  const presets = useMemo(() => {
    const list = model.input ? model.input.presets.map((p) => ({ id: p.id, label: p.label })) : [];
    return props.randomInput ? [...list, { id: "random", label: "Random" }] : list;
  }, [model.input, props.randomInput]);

  const onPreset = (id: string) => {
    if (id === "random" && props.randomInput) {
      applyInput(props.randomInput(Math.floor(Math.random() * 2 ** 31)));
      return;
    }
    const p = model.input?.presets.find((x) => x.id === id);
    if (p) applyInput(p.value);
  };

  const onApply = () => {
    const spec = model.input;
    if (!spec) return;
    if (raw.length > spec.maxLength) {
      setInputError(`Too long: ${raw.length} characters (at most ${spec.maxLength})`);
      return;
    }
    const r = spec.parse(raw);
    if (!r.ok) {
      setInputError(r.error);
      return;
    }
    applyInput(r.value);
  };

  const keyOpen = keyStepsOpen ?? isDesktop;
  const showCodeOpen = codeOpen ?? isDesktop;
  const hasCode = code !== undefined;

  return (
    <div
      className={cn(
        "w-full max-w-[1040px] rounded-xl border border-border bg-card p-3 text-card-foreground sm:p-4",
        hasCode && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:grid-rows-[repeat(6,auto)_1fr] lg:gap-x-6",
      )}
      data-player={playerId}
      data-motion={motion ? "on" : "off"}
      data-speed={String(speed)}
      data-step={ps.index + 1}
      data-hydrated={hydrated ? "true" : "false"}
      role="group"
      aria-label={`${model.title} visualization`}
      onKeyDown={onKeyDown}
    >
      <div className="min-w-0 space-y-3 lg:col-start-1">
        <div
          ref={figureRef}
          tabIndex={0}
          aria-describedby={descId}
          aria-label={`${model.title} figure. Arrow keys step, Space plays.`}
          role="group"
          className="viz-figure-bg overflow-hidden rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          data-player-figure=""
        >
          <VizFrameContext.Provider value={frameCtx}>
            <Renderer
              frame={frame}
              prev={prevFrame}
              width={width}
              motion={motion}
              hovered={hovered}
              onHover={setHovered}
              mode="full"
            />
          </VizFrameContext.Provider>
        </div>
        <StateDescription id={descId} text={model.describe(frame.state)} />
        {table && <StateTable data={table} />}
        <StepCaption label={stepLabel(ps.index + 1, total, frame.phase)} narration={frame.narration} />
        <LiveRegion text={live} />
      </div>

      <div className="mt-3 min-w-0 space-y-3 lg:col-start-1">
        {note && (
          <p className="text-sm text-muted-foreground" data-player-note="">
            {note}
          </p>
        )}
        {pendingPrompt && (
          <PromptPanel
            idPrefix={idPrefix}
            prompt={pendingPrompt}
            onAnswer={(choiceId) => {
              const p = pendingPrompt;
              act({ type: "answer", promptId: p.id, choiceId });
              setFeedback({ correct: choiceId === p.answerId, explain: p.explain });
              setFocusNextTick((n) => n + 1);
            }}
            onSkip={() => {
              const p = pendingPrompt;
              act({ type: "skipPrompt" });
              setFeedback({ correct: null, explain: p.explain });
              setFocusNextTick((n) => n + 1);
            }}
          />
        )}
        {feedback && <PromptFeedback correct={feedback.correct} explain={feedback.explain} />}
        {hint && !interacted && (
          <p className="text-sm text-muted-foreground" data-player-hint="">
            {hint}
          </p>
        )}
        <MainControls
          playing={ps.playing}
          promptOpen={pendingPrompt !== null}
          onFirst={() => act({ type: "first" })}
          onPrev={() => act({ type: "prev" })}
          onTogglePlay={togglePlay}
          onNext={() => act({ type: "next" })}
          onLast={() => act({ type: "last" })}
          nextRef={nextRef}
        />
        <Scrubber
          id={`${idPrefix}-scrubber`}
          index={ps.index}
          frameCount={total}
          phase={frame.phase}
          onSeek={(i) => act({ type: "seek", index: i }, "scrub")}
        />
        <SecondaryControls
          idPrefix={idPrefix}
          speed={speed}
          onSpeed={(s) => writePrefs({ speed: s })}
          motion={motion}
          onMotion={(on) => writePrefs({ motion: on ? "on" : "off" })}
          skipPrompts={prefs.skipPrompts}
          onSkipPrompts={(on) => writePrefs({ skipPrompts: on })}
          showTable={toTable ? showTable : null}
          onShowTable={setShowTable}
          onCopyLink={() => void copyLink()}
          onReset={reset}
        />
        {ops && opValue !== null && props.withOp && (
          <div role="radiogroup" aria-label="Operation" className="flex flex-wrap gap-1" data-player-ops="">
            {ops.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={o.id === opValue}
                tabIndex={o.id === opValue ? 0 : -1}
                onClick={() => applyInput(props.withOp!(input, o.id))}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  o.id === opValue ? "border-primary font-semibold" : "border-border hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <CounterStrip keys={model.counters} counters={frame.counters} prev={prevFrame?.counters ?? null} />
      </div>

      {hasCode && (
        <div className="mt-3 min-w-0 lg:col-start-2 lg:row-span-full lg:row-start-1 lg:mt-0">
          <details
            open={showCodeOpen}
            onToggle={(e) => setCodeOpen((e.currentTarget as HTMLDetailsElement).open)}
            data-player-code-details=""
          >
            <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden">
              Show code
            </summary>
            <CodePanel
              idPrefix={idPrefix}
              code={code}
              language={prefs.codeLanguage}
              line={frame.line}
              open={showCodeOpen}
              onLanguage={(lang) => writePrefs({ codeLanguage: lang })}
            />
          </details>
        </div>
      )}

      {model.input && (
        <div className="mt-4 min-w-0 lg:col-start-1">
          <InputBar
            idPrefix={idPrefix}
            label={model.input.label}
            placeholder={model.input.placeholder}
            help={model.input.help}
            raw={raw}
            error={inputError}
            presets={presets}
            onRawChange={setRaw}
            onApply={onApply}
            onPreset={onPreset}
          />
        </div>
      )}

      <div className="mt-4 min-w-0 lg:col-start-1">
        <KeySteps
          frames={frames}
          Renderer={Renderer}
          open={keyOpen}
          onToggle={(o) => {
            if (o !== keyOpen) setKeyStepsOpen(o);
          }}
          onSeek={(i) => act({ type: "seek", index: i })}
        />
      </div>
    </div>
  );
}
