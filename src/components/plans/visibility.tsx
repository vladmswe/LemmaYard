import { GlobeIcon, LinkIcon, LockIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import type { PlanVisibility } from "@/lib/plans/schemas";

export type VisibilityMeta = { label: string; short: string; hint: string; icon: LucideIcon };

/** Words for the three visibilities (status = icon + word, DESIGN.md §3). */
export const VISIBILITY: Record<PlanVisibility, VisibilityMeta> = {
  private: { label: "Private", short: "Private", hint: "Only you", icon: LockIcon },
  unlisted: {
    label: "Anyone with the link",
    short: "Link",
    hint: "Not listed; everyone sees their own progress",
    icon: LinkIcon,
  },
  public: { label: "Public", short: "Public", hint: "Listed under Discover on Study plans", icon: GlobeIcon },
};

export function VisibilityBadge({ visibility, className }: { visibility: PlanVisibility; className?: string }) {
  const v = VISIBILITY[visibility];
  const Icon = v.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <Icon aria-hidden />
      {v.short}
      {visibility === "unlisted" && <span className="sr-only"> (anyone with the link)</span>}
    </Badge>
  );
}
