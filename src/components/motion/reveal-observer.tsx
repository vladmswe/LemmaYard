"use client";

import { useEffect } from "react";

const SELECTOR = ".rv:not([data-revealed])";

function reveal(el: Element) {
  el.setAttribute("data-revealed", "");
}

/**
 * Shows `.rv` scroll reveals (DESIGN.md §11.2) once 10% of them is in view,
 * then stops watching them. One instance lives in the root layout and also
 * picks up elements added later (client navigation, streamed Suspense
 * content). Without IntersectionObserver, or under reduced motion, every
 * reveal is shown at once. Renders nothing.
 */
export function RevealObserver() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      const showAll = () => document.querySelectorAll(SELECTOR).forEach(reveal);
      showAll();
      const mo = new MutationObserver(showAll);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const watched = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        io.observe(el);
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);
  return null;
}
