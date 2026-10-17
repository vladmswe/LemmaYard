import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { cn } from "cn";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Qed } from "@/components/brand/qed";
import { Reveal } from "@/components/motion/reveal";

export type Crumb = { label: string; href?: string };

/**
 * Page head (DESIGN.md §13): breadcrumb, the page's single h1 in the display
 * serif (`size` d2 by default, d1 for section index pages), an optional ∎,
 * a meta line and an aside slot (`actions`, e.g. a progress card). On paper
 * with a faint grid; the last crumb is the current page (no link).
 */
export function PageHead({
  crumbs,
  title,
  subtitle,
  leading,
  actions,
  size = "d2",
  qed = false,
  className,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  /** e.g. the profile avatar, shown left of the title. */
  leading?: ReactNode;
  actions?: ReactNode;
  /** Display size of the h1: "d1" (44–84px) or "d2" (36–60px). */
  size?: "d1" | "d2";
  /** End the title with the ∎ tombstone (one ∎ headline per viewport). */
  qed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden border-b py-10 min-[961px]:py-14", className)}>
      <div
        aria-hidden
        className="grid-paper [mask-image:radial-gradient(60%_90%_at_80%_30%,#000_20%,transparent_75%)]"
      />
      <Reveal className="container-page relative">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${i}`}>
                  <BreadcrumbItem>
                    {last ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : !crumb.href ? (
                      <span>{crumb.label}</span>
                    ) : (
                      <BreadcrumbLink render={<Link href={crumb.href} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div className="flex min-w-0 items-center gap-4">
            {leading}
            <div className="min-w-0">
              <h1 className={cn("break-words", size === "d1" ? "display-1" : "display-2")}>
                {title}
                {qed && <Qed />}
              </h1>
              {subtitle && <p className="mt-4 text-foreground-secondary">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
        </div>
      </Reveal>
    </div>
  );
}
