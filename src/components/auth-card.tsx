import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

/** Centered auth card on a sunken page (DESIGN.md §9.2). */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden bg-surface-sunken px-4 py-12 sm:py-16">
      <div aria-hidden className="graph-paper graph-paper-center opacity-40" />
      <Reveal className="relative mx-auto w-full max-w-[400px]">
        <Card className="gap-6 shadow-sm [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
          <CardHeader className="justify-items-center gap-2 text-center">
            <LogoMark className="mb-2 size-10" />
            <h1 className="font-heading text-[1.75rem]/9 font-semibold tracking-[-0.01em]">
              {title}
            </h1>
            <p className="text-[0.9375rem] text-muted-foreground">{description}</p>
          </CardHeader>
          <CardContent>{children}</CardContent>
          <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
        </Card>
      </Reveal>
    </section>
  );
}
