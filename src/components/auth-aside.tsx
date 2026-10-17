import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { DifficultyGlyph } from "@/components/problems/difficulty-badge";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import { formatTagLabel } from "@/lib/format";
import type { LemmaOfTheDay } from "@/server/landing";

/** Login panel (DESIGN.md §13.2): one problem a day as a static proof sheet. */
export function LemmaOfTheDayPanel({ lemma }: { lemma: LemmaOfTheDay | null }) {
  return (
    <div className="max-w-[34rem]">
      <p className="eyebrow-accent">Lemma of the day</p>
      {lemma ? (
        <>
          <p className="mt-7 font-mono text-sm text-on-cobalt-2">Problem {lemma.number}</p>
          <h2 className="display-1 mt-2">{lemma.title}</h2>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-on-cobalt px-3 text-[0.8125rem] font-semibold text-cobalt">
              <DifficultyGlyph difficulty={lemma.difficulty} />
              {DIFFICULTIES[lemma.difficulty].label}
            </span>
            {lemma.tags.map((t) => (
              <span
                key={t}
                className="inline-flex h-7 items-center rounded-sm border border-cobalt-line/70 px-2.5 text-[0.8125rem] font-medium text-on-cobalt-2"
              >
                {formatTagLabel(t)}
              </span>
            ))}
          </div>
          <div className="mt-10 rounded-xl border border-cobalt-line/50 bg-white/[0.06] px-6 py-5 font-mono text-[0.875rem]/[1.9] text-on-cobalt-2">
            <div>
              <span className="text-on-cobalt">Given</span> the statement and its examples
            </div>
            <div>
              <span className="text-on-cobalt">Want</span>&nbsp; every hidden test passing
            </div>
            <div>
              <span className="text-on-cobalt">Proof</span> your solution, once you log in
            </div>
          </div>
          <Link
            href={`/problems/${lemma.slug}`}
            className="group/lemma mt-8 inline-flex items-center gap-2 rounded-sm font-semibold text-on-cobalt underline-offset-4 hover:underline"
          >
            Read the problem
            <ArrowRightIcon
              aria-hidden
              className="size-4 transition-transform duration-200 ease-out motion-safe:group-hover/lemma:translate-x-[3px]"
            />
          </Link>
        </>
      ) : (
        <h2 className="display-1 mt-6">Pick up where you left off.</h2>
      )}
    </div>
  );
}

const BENEFITS = [
  {
    title: "Original problems, honest feedback",
    body: "Clear statements with examples and constraints. Every submit runs the hidden tests in an isolated sandbox.",
  },
  {
    title: "Progress that counts once",
    body: "Your profile tracks solved problems by difficulty and keeps every submission with its code.",
  },
  {
    title: "A guide and rooms for friends",
    body: "Step through data structures in the guide, or solve a weekly set together in a private room.",
  },
];

/** Register panel (DESIGN.md §13.2): "What you get" as a ∎ list. */
export function WhatYouGetPanel() {
  return (
    <div className="max-w-[34rem]">
      <p className="eyebrow-accent">What you get</p>
      <h2 className="display-1 mt-6">
        Small proven steps <em>add up</em>.
      </h2>
      <ul className="mt-12 flex flex-col">
        {BENEFITS.map((b) => (
          <li
            key={b.title}
            className="grid grid-cols-[2rem_1fr] border-t border-cobalt-line/45 py-5 first:border-t-0 first:pt-0"
          >
            <span aria-hidden className="mt-2 size-2.5 bg-on-cobalt" />
            <div>
              <h3 className="text-lg/7 font-semibold">{b.title}</h3>
              <p className="mt-1 text-on-cobalt-2">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
