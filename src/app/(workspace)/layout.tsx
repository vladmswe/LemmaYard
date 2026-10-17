import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

/**
 * Full-height workspace (problem page, M3): compact header, no footer.
 * Content fills the viewport below the 52px header + 1px border and scrolls
 * inside its own panes (DESIGN.md §6.4). No routes live here yet.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader compact />
      <main
        id="main"
        tabIndex={-1}
        className="flex h-[calc(100dvh-53px)] min-h-0 flex-col overflow-hidden bg-surface-sunken"
      >
        {children}
      </main>
    </>
  );
}
