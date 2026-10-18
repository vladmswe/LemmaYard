"use client";

import { useEffect, useRef, useState } from "react";

interface Heading {
  id: string;
  text: string;
}

/**
 * "On this page": built after hydration from the article's `h2[id]`
 * (rehype-slug ids). A disclosure on small screens, open and sticky from xl.
 */
export function LessonToc({ articleId }: { articleId: string }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;
    const list = Array.from(article.querySelectorAll<HTMLHeadingElement>("h2[id]")).map((h) => ({
      id: h.id,
      text: h.textContent?.trim() ?? h.id,
    }));
    // Reading the DOM once after mount is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeadings(list);
  }, [articleId]);

  // The section being read is drawn in primary (DESIGN.md §13.9): the last h2 above the top third.
  useEffect(() => {
    if (headings.length === 0 || typeof IntersectionObserver === "undefined") return;
    const els = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => el !== null);
    const update = () => {
      const line = window.innerHeight / 3;
      let current: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      setActive(current ?? els[0]?.id ?? null);
    };
    const io = new IntersectionObserver(update, { rootMargin: "0px 0px -66% 0px" });
    els.forEach((el) => io.observe(el));
    update();
    return () => io.disconnect();
  }, [headings]);

  const shown = headings.length > 0;
  useEffect(() => {
    if (shown && ref.current && window.matchMedia("(min-width: 80rem)").matches) ref.current.open = true;
  }, [shown]);

  if (headings.length === 0) return null;
  return (
    <nav aria-label="On this page" className="guide-toc" data-lesson-toc="">
      <details ref={ref} className="guide-toc-details">
        <summary className="guide-toc-summary">On this page</summary>
        <ol className="guide-toc-list">
          {headings.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`} className="guide-toc-link" data-active={h.id === active || undefined}>
                {h.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
