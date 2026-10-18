/**
 * After a post or an edit the server components re-render; once the comment
 * with `id` is in the DOM, scroll it into view and move focus to it
 * (docs/specs/community.md §B.15). Gives up after ~4 s.
 */
export function focusCommentWhenReady(id: string): void {
  if (typeof window === "undefined") return;
  const started = performance.now();
  const tick = () => {
    const el = document.getElementById(`comment-${id}`);
    if (el) {
      el.focus({ preventScroll: true });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      return;
    }
    if (performance.now() - started < 4000) window.setTimeout(tick, 80);
  };
  window.setTimeout(tick, 60);
}
