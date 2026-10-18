// Small shared pieces of LeetCode problems in rooms
// (docs/specs/rooms-external-problems.md §2, §5): the outbound link, the
// "LeetCode" tag and the "SELF" (self-reported) marker. No hooks: they render
// on the server and in client screens alike. The link is built from a
// validated slug, opens a new tab, and sends no referrer; nothing from
// leetcode.com is ever loaded into our pages.
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { leetcodeProblemUrl, NEW_TAB_SR, SELF_REPORTED_LABEL, SELF_REPORTED_TOOLTIP } from "@/lib/rooms/external";

const TAG =
  "inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 font-mono text-[0.6875rem] font-semibold tracking-[0.04em] uppercase";

/** `<a>` to https://leetcode.com/problems/<slug>/ in a new tab, without opener or referrer. */
export function LeetCodeLink({
  slug,
  children,
  className,
  icon = true,
  testId,
  decorative = false,
}: {
  slug: string;
  children: ReactNode;
  className?: string;
  icon?: boolean;
  testId?: string;
  /** A second link to the same place (hidden from assistive tech, not a tab stop). */
  decorative?: boolean;
}) {
  return (
    <a
      href={leetcodeProblemUrl(slug)}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className={cn("text-link hover:underline", className)}
      data-testid={testId}
      data-external-slug={slug}
      {...(decorative ? { "aria-hidden": true, tabIndex: -1 } : {})}
    >
      {children}
      {icon && <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.125em]" />}
      {!decorative && <span className="sr-only">{NEW_TAB_SR}</span>}
    </a>
  );
}

/** "LeetCode" next to a problem: this slot links out and is honor-system. */
export function LeetCodeTag({ className }: { className?: string }) {
  return (
    <span className={cn(TAG, "border-border-strong text-foreground-secondary", className)} data-testid="leetcode-tag">
      LeetCode
    </span>
  );
}

/**
 * "SELF" on a self-reported solve: text and a dashed border, never colour
 * alone. `sr` adds a spoken word for places without their own sentence.
 */
export function SelfReportedTag({ className, sr = false }: { className?: string; sr?: boolean }) {
  return (
    <span
      className={cn(TAG, "h-[18px] border-dashed border-foreground-secondary text-[0.625rem] text-foreground-secondary", className)}
      title={SELF_REPORTED_TOOLTIP}
      data-testid="self-reported"
    >
      <span aria-hidden={sr ? true : undefined}>{SELF_REPORTED_LABEL}</span>
      {sr && <span className="sr-only">self-reported</span>}
    </span>
  );
}
