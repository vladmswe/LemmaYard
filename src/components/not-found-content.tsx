import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";

/** 404 body (DESIGN.md §9.8), shared by the root and route-group not-found. */
export function NotFoundContent() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div aria-hidden className="graph-paper graph-paper-center" />
      <Reveal className="container-page relative py-24 text-center sm:py-32">
        <p className="eyebrow mb-3">404</p>
        <h1 className="font-heading text-3xl/[2.375rem] font-semibold tracking-[-0.015em] text-balance sm:text-4xl/11">
          We couldn&apos;t find that page
        </h1>
        <p className="mx-auto mt-4 max-w-md text-foreground-secondary">
          The problem or page may have moved, or the link is incorrect.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/problems" className={buttonVariants()}>
            Browse problems
          </Link>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Go home
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
