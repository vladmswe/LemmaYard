"use client";

import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import type { PredictPrompt } from "@/lib/guide/contracts";

/** "Predict before reveal": radio choices, Check, and "Just show me". Focus starts on the question. */
export function PromptPanel({
  idPrefix,
  prompt,
  onAnswer,
  onSkip,
}: {
  idPrefix: string;
  prompt: PredictPrompt;
  onAnswer: (choiceId: string) => void;
  onSkip: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const legendRef = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    legendRef.current?.focus();
  }, [prompt.id]);
  const name = `${idPrefix}-prompt-${prompt.id}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (choice !== null) onAnswer(choice);
      }}
    >
      <fieldset
        role="group"
        className="guide-predict"
        data-player-prompt=""
      >
        <span aria-hidden="true" className="guide-predict-tag">
          Predict
        </span>
        <legend
          ref={legendRef}
          tabIndex={-1}
          className="float-left w-full rounded-sm pb-1 font-medium"
        >
          {prompt.question}
        </legend>
        <div className="clear-both flex flex-col gap-1">
          {prompt.choices.map((c) => (
            <label
              key={c.id}
              className="guide-predict-choice"
            >
              <input
                type="radio"
                name={name}
                value={c.id}
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
                className="size-5 accent-primary"
                data-choice={c.id}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11 px-4" disabled={choice === null}>
            Check
          </Button>
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={onSkip}>
            Just show me
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function PromptFeedback({ correct, explain }: { correct: boolean | null; explain: string }) {
  return (
    <p
      className={cn("guide-feedback", correct === true && "guide-feedback-right", correct === false && "guide-feedback-wrong")}
      data-player-feedback=""
    >
      {correct === true && <CircleCheckIcon aria-hidden className="guide-feedback-icon" />}
      {correct === false && <CircleXIcon aria-hidden className="guide-feedback-icon" />}
      <span>
        {correct !== null && <strong className="mr-1">{correct ? "Right." : "Not quite."}</strong>}
        {explain}
      </span>
    </p>
  );
}
