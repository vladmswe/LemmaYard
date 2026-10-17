"use client";

import { useEffect, useRef, useState } from "react";

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
        className="space-y-3 rounded-lg border border-border bg-muted/40 p-3"
        data-player-prompt=""
      >
        <legend
          ref={legendRef}
          tabIndex={-1}
          className="float-left w-full rounded-sm pb-1 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {prompt.question}
        </legend>
        <div className="clear-both flex flex-col gap-1">
          {prompt.choices.map((c) => (
            <label
              key={c.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
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
    <p className="rounded-lg border border-border p-3 text-sm" data-player-feedback="">
      {correct !== null && <strong className="mr-1">{correct ? "Right." : "Not quite."}</strong>}
      {explain}
    </p>
  );
}
