import { CodeIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Editor slot of the problem workspace (DESIGN.md §13.4), M5 contract:
 *
 * - `toolbar`: the 46px toolbar row (language select, Reset, Run, Submit).
 *   Rendered above the editor with `border-b`; omitted = no toolbar row.
 * - `children`: the editor itself (Monaco). It gets a flex-1, min-h-0 box
 *   that fills the pane (on mobile: 55dvh); size Monaco to 100% / 100%.
 *   Omitted = the read-only placeholder below.
 * - `statusBar`: the 28px mono status row ("Ln, Col" · language · indent … "Saved locally").
 *
 * The pane renders exactly once per page (the workspace picks the desktop
 * split or the mobile tabs on the client), so Monaco mounts once.
 */
export type EditorPaneProps = {
  toolbar?: ReactNode;
  children?: ReactNode;
  statusBar?: ReactNode;
  className?: string;
};

export function EditorPane({ toolbar, children, statusBar, className }: EditorPaneProps) {
  return (
    <section
      aria-label="Code editor"
      data-slot="editor-pane"
      className={cn("flex h-full min-h-0 flex-col bg-editor", className)}
    >
      {toolbar && (
        <div className="flex h-[46px] shrink-0 items-center gap-1.5 border-b bg-card pr-2 pl-2.5">{toolbar}</div>
      )}
      <div className="relative min-h-0 flex-1">{children ?? <EditorPlaceholder />}</div>
      {statusBar && (
        <div className="flex h-7 shrink-0 items-center gap-4 border-t bg-editor px-3.5 font-mono text-xs text-muted-foreground">
          {statusBar}
        </div>
      )}
    </section>
  );
}

function EditorPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <CodeIcon aria-hidden className="size-6 text-muted-foreground" strokeWidth={1.75} />
      <p className="text-sm font-semibold text-foreground">The code editor is on its way</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Writing, running and submitting solutions will be available here soon.
      </p>
    </div>
  );
}
