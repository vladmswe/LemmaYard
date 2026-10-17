"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, CircleIcon, XCircleIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { progressStore, recordQuiz, useProgress } from "@/lib/guide/content/progress";
import type { QuizChoice, QuizData, QuizQuestion } from "@/lib/guide/content/types";

/** True when `selected` is the answer (set for single/multi, sequence for order). */
export function isCorrect(q: QuizQuestion, selected: readonly string[]): boolean {
  if (q.kind === "order") return selected.length === q.answer.length && selected.every((id, i) => id === q.answer[i]);
  return selected.length === q.answer.length && q.answer.every((id) => selected.includes(id));
}

type Verdict = "right" | "wrong" | "missed" | "other";
const VERDICT_TEXT: Record<Verdict, string> = {
  right: "Correct choice.",
  wrong: "Not this one.",
  missed: "You missed this one.",
  other: "Not an answer.",
};

function choiceVerdict(q: QuizQuestion, id: string, selected: readonly string[]): Verdict {
  const isAnswer = q.answer.includes(id);
  const picked = selected.includes(id);
  if (isAnswer && picked) return "right";
  if (picked) return "wrong";
  if (isAnswer) return "missed";
  return "other";
}

function VerdictIcon({ v }: { v: Verdict }) {
  if (v === "right") return <CheckCircle2Icon aria-hidden className="guide-quiz-icon" data-verdict="right" />;
  if (v === "wrong" || v === "missed") return <XCircleIcon aria-hidden className="guide-quiz-icon" data-verdict={v} />;
  return <CircleIcon aria-hidden className="guide-quiz-icon" data-verdict="other" />;
}

function Feedback({ verdict, choice }: { verdict: Verdict; choice: QuizChoice }) {
  return (
    <p className="guide-quiz-feedback" data-verdict={verdict}>
      <VerdictIcon v={verdict} />
      <span>
        <strong>{VERDICT_TEXT[verdict]}</strong> {choice.feedback}
      </span>
    </p>
  );
}

function Question({
  q,
  index,
  total,
  saved,
  onResult,
}: {
  q: QuizQuestion;
  index: number;
  total: number;
  saved: boolean | undefined;
  onResult: (correct: boolean) => void;
}) {
  const uid = useId();
  const legendId = `${uid}-legend`;
  const initial = q.kind === "order" ? q.choices.map((c) => c.id) : [];
  const [selected, setSelected] = useState<string[]>(initial);
  const [checked, setChecked] = useState<boolean | null>(null); // null = not checked in this view
  const [status, setStatus] = useState("");
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    const sel = focusNext.current;
    if (!sel || !rootRef.current) return;
    focusNext.current = null;
    rootRef.current.querySelector<HTMLElement>(sel)?.focus();
  });

  const byId = new Map(q.choices.map((c) => [c.id, c]));
  const done = checked !== null;

  const check = () => {
    if (q.kind !== "order" && selected.length === 0) {
      setStatus("Pick an answer first.");
      return;
    }
    const ok = isCorrect(q, selected);
    setChecked(ok);
    setStatus(`${ok ? "Correct." : "Not quite."} ${q.explain}`);
    onResult(ok);
    focusNext.current = "[data-quiz-retry]";
  };

  const retry = () => {
    setSelected(initial);
    setChecked(null);
    setStatus("");
    focusNext.current = q.kind === "order" ? "[data-move]:not(:disabled)" : "[data-quiz-choice]";
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = selected.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    setSelected(next);
    setStatus(`Moved "${byId.get(id)?.label}" to position ${j + 1} of ${next.length}.`);
    const atEdge = j === 0 || j === next.length - 1;
    const want = dir === -1 ? "up" : "down";
    const other = dir === -1 ? "down" : "up";
    focusNext.current = `[data-move="${atEdge ? other : want}"][data-choice="${id}"]`;
  };

  const result = checked ?? saved;
  return (
    <fieldset
      ref={rootRef}
      className="guide-quiz-question"
      data-quiz-question={q.id}
      data-kind={q.kind}
      data-result={result === undefined ? "none" : result ? "correct" : "incorrect"}
    >
      <legend id={legendId} className="guide-quiz-prompt">
        <span className="guide-quiz-number">
          Question {index + 1} of {total}
          {q.kind === "multi" ? " · choose all that apply" : q.kind === "order" ? " · put in order" : ""}
        </span>
        {q.prompt}
      </legend>
      {q.code && (
        <pre className="guide-quiz-code" tabIndex={0}>
          <code>{q.code}</code>
        </pre>
      )}

      {q.kind === "single" && (
        <RadioGroup
          aria-labelledby={legendId}
          value={selected[0] ?? null}
          onValueChange={(v) => setSelected(v ? [String(v)] : [])}
          disabled={done}
          className="guide-quiz-choices"
        >
          {q.choices.map((c) => (
            <div key={c.id} className="guide-quiz-choice-wrap">
              <label className="guide-quiz-choice">
                <RadioGroupItem value={c.id} data-quiz-choice={c.id} />
                <span>{c.label}</span>
              </label>
              {done && <Feedback verdict={choiceVerdict(q, c.id, selected)} choice={c} />}
            </div>
          ))}
        </RadioGroup>
      )}

      {q.kind === "multi" && (
        <div role="group" aria-labelledby={legendId} className="guide-quiz-choices">
          {q.choices.map((c) => (
            <div key={c.id} className="guide-quiz-choice-wrap">
              <label className="guide-quiz-choice">
                <Checkbox
                  checked={selected.includes(c.id)}
                  disabled={done}
                  data-quiz-choice={c.id}
                  onCheckedChange={(on) =>
                    setSelected((s) => (on ? [...s.filter((x) => x !== c.id), c.id] : s.filter((x) => x !== c.id)))
                  }
                />
                <span>{c.label}</span>
              </label>
              {done && <Feedback verdict={choiceVerdict(q, c.id, selected)} choice={c} />}
            </div>
          ))}
        </div>
      )}

      {q.kind === "order" && (
        <ol className="guide-quiz-order" aria-labelledby={legendId}>
          {selected.map((id, i) => {
            const c = byId.get(id) as QuizChoice;
            const rightPlace = q.answer[i] === id;
            return (
              <li key={id} className="guide-quiz-order-item" data-order-item={id}>
                <div className="guide-quiz-order-row">
                  <span className="guide-quiz-order-pos" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="guide-quiz-order-label">{c.label}</span>
                  <span className="guide-quiz-order-buttons">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-11"
                      aria-label={`Move "${c.label}" up`}
                      data-move="up"
                      data-choice={id}
                      disabled={done || i === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUpIcon aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-11"
                      aria-label={`Move "${c.label}" down`}
                      data-move="down"
                      data-choice={id}
                      disabled={done || i === selected.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDownIcon aria-hidden />
                    </Button>
                  </span>
                </div>
                {done && (
                  <p className="guide-quiz-feedback" data-verdict={rightPlace ? "right" : "wrong"}>
                    <VerdictIcon v={rightPlace ? "right" : "wrong"} />
                    <span>
                      <strong>
                        {rightPlace ? "Right place." : `Belongs at position ${q.answer.indexOf(id) + 1}.`}
                      </strong>{" "}
                      {c.feedback}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="guide-quiz-actions">
        {done ? (
          <Button type="button" variant="secondary" className="min-h-11" data-quiz-retry="" onClick={retry}>
            Try again
          </Button>
        ) : (
          <Button type="button" className="min-h-11" data-quiz-check="" onClick={check}>
            Check
          </Button>
        )}
        {!done && saved !== undefined && (
          <span className="guide-quiz-saved" data-quiz-saved={saved ? "correct" : "incorrect"}>
            Last attempt: {saved ? "correct" : "not correct"}
          </span>
        )}
      </div>
      {done && (
        <div className="guide-quiz-explain" data-quiz-explain="">
          <p>
            <strong>{checked ? "Correct." : "Not quite."}</strong> {q.explain}
          </p>
        </div>
      )}
      <p className="sr-only" aria-live="polite" data-quiz-status="">
        {status}
      </p>
    </fieldset>
  );
}

/** `<Quiz id="...">`: every question on one page, each with its own Check; answers saved to progress. */
export function QuizClient({
  lessonSlug,
  quiz,
  lessonQuestionIds,
}: {
  lessonSlug: string;
  quiz: QuizData;
  lessonQuestionIds: readonly string[];
}) {
  const progress = useProgress();
  const saved = progress.lessons[lessonSlug]?.quiz ?? {};
  const ids = quiz.questions.map((q) => q.id);
  const answered = ids.filter((id) => id in saved);
  const correct = answered.filter((id) => saved[id]).length;

  const onResult = (questionId: string, ok: boolean) => {
    progressStore().update((p) =>
      recordQuiz(p, lessonSlug, questionId, ok, { now: new Date().toISOString(), questionIds: lessonQuestionIds }),
    );
  };

  return (
    <section className="guide-quiz guide-wide" aria-label="Check yourself quiz" data-quiz={quiz.id}>
      {quiz.questions.map((q, i) => (
        <Question
          key={q.id}
          q={q}
          index={i}
          total={quiz.questions.length}
          saved={saved[q.id]}
          onResult={(ok) => onResult(q.id, ok)}
        />
      ))}
      <p className="guide-quiz-score" data-quiz-score={`${correct}/${ids.length}`}>
        {answered.length === 0
          ? `${ids.length} questions. Your answers are saved in this browser.`
          : `Score: ${correct} of ${ids.length} correct (${answered.length} answered).`}
      </p>
    </section>
  );
}
