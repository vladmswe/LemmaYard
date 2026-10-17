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
import { Reveal } from "@/components/motion/reveal";

export type Crumb = { label: string; href?: string };

/**
 * Page head band (DESIGN.md §9): breadcrumb + the page's single h1 + subtitle
 * on a sunken background. The last crumb is the current page (no link).
 */
export function PageHead({
  crumbs,
  title,
  subtitle,
  leading,
  actions,
  className,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  /** e.g. the profile avatar, shown left of the title. */
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b bg-surface-sunken py-8", className)}>
      <Reveal className="container-page">
        <Breadcrumb className="mb-2.5">
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${i}`}>
                  <BreadcrumbItem>
                    {last || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {leading}
            <div className="min-w-0">
              <h1 className="font-heading text-3xl/[2.375rem] font-semibold tracking-[-0.015em] text-balance sm:text-4xl/11">
                {title}
              </h1>
              {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
        </div>
      </Reveal>
    </div>
  );
}
