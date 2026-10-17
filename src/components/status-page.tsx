import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Centred status layout of 404 and error pages (DESIGN.md §13.11): a large
 * dashed ∎ box (danger-tinted for errors), a d1 headline, a lead and the
 * actions. The only centred layout in the system.
 */
export function StatusPage({
  eyebrow,
  title,
  lead,
  actions,
  footnote,
  tone = "default",
  role,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Small mono line under the actions (e.g. the error digest). */
  footnote?: ReactNode;
  tone?: "default" | "danger";
  role?: "alert";
}) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="grid-paper [mask-image:radial-gradient(50%_60%_at_50%_40%,#000_10%,transparent_75%)]"
      />
      <div role={role} className="reveal container-page relative flex flex-col items-center py-20 text-center sm:py-28">
        <span
          aria-hidden
          className={cn(
            "mb-10 block size-28 border-2 border-dashed sm:size-40",
            tone === "danger" ? "border-danger bg-danger-bg/40" : "border-primary bg-secondary/40",
          )}
        />
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h1 className="display-1 max-w-[16ch]">{title}</h1>
        {lead && <div className="lead mx-auto mt-6 max-w-[38ch]">{lead}</div>}
        {actions && <div className="mt-10 flex flex-wrap justify-center gap-3">{actions}</div>}
        {footnote && (
          <p className="mt-8 font-mono text-xs break-all text-faint-foreground">{footnote}</p>
        )}
      </div>
    </div>
  );
}
