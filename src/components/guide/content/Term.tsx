import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GlossaryEntry } from "@/lib/guide/content/types";

/**
 * `<Term id="load-factor">load factor</Term>`: a link to the glossary entry
 * with the definition as a tooltip; the first use on a page is a `<dfn>`.
 */
export function Term({ entry, first, children }: { entry: GlossaryEntry; first: boolean; children?: ReactNode }) {
  const link = (
    <Tooltip>
      <TooltipTrigger
        delay={300}
        render={<a href={`/learn/glossary#${entry.id}`} className="guide-term" data-term={entry.id} />}
      >
        {children ?? entry.term}
      </TooltipTrigger>
      <TooltipContent>{entry.definition}</TooltipContent>
    </Tooltip>
  );
  return first ? <dfn className="guide-dfn">{link}</dfn> : link;
}
