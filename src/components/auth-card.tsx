import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Qed } from "@/components/brand/qed";
import { Reveal } from "@/components/motion/reveal";

/**
 * Auth layout (DESIGN.md §13.2). From 961px: the form on paper (5/12) and a
 * cobalt block with grain and grid paper (7/12) holding `aside`, a static
 * proof sheet. Below: the form only, under a 120px cobalt strip with the
 * mark. The form stays first in DOM and tab order.
 */
export function AuthCard({
  title,
  description,
  footer,
  aside,
  children,
}: {
  title: string;
  description: string;
  footer: ReactNode;
  /** Content of the cobalt panel (decorative or supporting, never required). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-1 flex-col min-[961px]:container-page min-[961px]:grid min-[961px]:grid-cols-12 min-[961px]:gap-x-5 min-[961px]:py-8">
      <div
        aria-hidden
        className="on-cobalt grain relative flex h-[120px] items-center justify-center overflow-hidden min-[961px]:hidden"
      >
        <div className="grid-paper" />
        <LogoMark className="relative size-12 text-on-cobalt" />
      </div>
      <div className="flex flex-col justify-center px-[var(--pad)] py-12 min-[961px]:col-span-5 min-[961px]:px-0 min-[961px]:py-16 min-[961px]:pr-12">
        <Reveal className="mx-auto w-full max-w-[400px] min-[961px]:mx-0">
          <h1 className="display-2">
            {title}
            <Qed />
          </h1>
          <p className="mt-4 text-[1.0625rem] text-foreground-secondary">{description}</p>
          <div className="mt-9">{children}</div>
          <div className="mt-8 border-t pt-6 text-[0.9375rem] text-muted-foreground">{footer}</div>
        </Reveal>
      </div>
      <div className="hidden min-[961px]:col-span-7 min-[961px]:flex">
        <div className="on-cobalt grain relative flex flex-1 flex-col justify-center overflow-hidden rounded-2xl px-14 py-16 min-[1280px]:px-18">
          <div
            aria-hidden
            className="grid-paper [mask-image:linear-gradient(100deg,transparent_5%,#000_45%,transparent_95%)]"
          />
          <div className="relative">{aside}</div>
        </div>
      </div>
    </section>
  );
}
