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
              <a href={`#${h.id}`} className="guide-toc-link">
                {h.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
