import {
  BookOpenIcon,
  CodeIcon,
  InfoIcon,
  LightbulbIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type CalloutKind = "note" | "tip" | "pitfall" | "language" | "invariant" | "aside";

const KINDS: Record<CalloutKind, { label: string; icon: LucideIcon; variant: "info" | "success" | "warning" }> = {
  note: { label: "Note", icon: InfoIcon, variant: "info" },
  tip: { label: "Tip", icon: LightbulbIcon, variant: "success" },
  pitfall: { label: "Pitfall", icon: TriangleAlertIcon, variant: "warning" },
  language: { label: "In your language", icon: CodeIcon, variant: "info" },
  invariant: { label: "Invariant", icon: ShieldCheckIcon, variant: "info" },
  aside: { label: "Aside", icon: BookOpenIcon, variant: "info" },
};

/** `<Callout kind="pitfall" title="...">markdown</Callout>` in lesson MDX. */
export function Callout({ kind = "note", title, children }: { kind?: CalloutKind; title?: string; children: ReactNode }) {
  const k = KINDS[kind] ?? KINDS.note;
  const Icon = k.icon;
  return (
    <Alert variant={k.variant} role="note" data-callout={kind} className="guide-callout">
      <Icon aria-hidden />
      <AlertTitle>
        {title ? (
          <>
            <span className="sr-only">{k.label}: </span>
            {title}
          </>
        ) : (
          k.label
        )}
      </AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
