"use client";

import { CodeIcon, FileTextIcon, HistoryIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { cn } from "cn";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query";

/**
 * Problem page layout (DESIGN.md §8.21, §9.4; AC-M3-4, AC-M3-6). Slots:
 *
 * - `description`: left "Description" tab (server-rendered statement).
 * - `submissions`: left "Submissions" tab (M6 fills it).
 * - `editor`: right top, normally an `<EditorPane>` (M5: Monaco + toolbar).
 * - `console`: right bottom, normally a `<ConsolePane>` (M5: run results).
 * - `footer`: optional mobile-only fixed bar under the content (M5: Run /
 *   Submit action bar). When set, the mobile panels get bottom padding.
 * - `mobileTab` / `onMobileTabChange`: optional control of the mobile tab
 *   (Run/Submit in the action bar switch to "code"). Uncontrolled otherwise.
 *
 * >= 768px: resizable split, description 45% (30–65%) | editor 58% (min 25%)
 * over console 42% (min 20%, collapsible); sizes persist in localStorage.
 * < 768px: tabs Description | Code, the Code tab stacks editor (55dvh) and
 * console. The layout is chosen on the client, so each slot mounts once;
 * during SSR/hydration a static fallback shows the description.
 */
export type ProblemWorkspaceProps = {
  description: ReactNode;
  submissions: ReactNode;
  editor: ReactNode;
  console: ReactNode;
  footer?: ReactNode;
  mobileTab?: MobileTab;
  onMobileTabChange?: (tab: MobileTab) => void;
};

export type MobileTab = "description" | "code";

const paneClasses = "h-full min-h-0 overflow-hidden rounded-lg border bg-card shadow-xs";

export function ProblemWorkspace(props: ProblemWorkspaceProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  if (desktop === null) return <WorkspaceFallback description={props.description} />;
  return desktop ? <DesktopWorkspace {...props} /> : <MobileWorkspace {...props} />;
}

/** Left pane tabs: Description | Submissions. */
function LeftTabs({ description, submissions }: Pick<ProblemWorkspaceProps, "description" | "submissions">) {
  return (
    <Tabs defaultValue="description" className="h-full min-h-0 gap-0">
      <TabsList aria-label="Problem" className="shrink-0 px-2">
        <TabsTrigger value="description">
          <FileTextIcon aria-hidden />
          Description
        </TabsTrigger>
        <TabsTrigger value="submissions">
          <HistoryIcon aria-hidden />
          Submissions
        </TabsTrigger>
      </TabsList>
      <TabsContent value="description" keepMounted className="min-h-0 overflow-y-auto">
        {description}
      </TabsContent>
      <TabsContent value="submissions" keepMounted className="min-h-0 overflow-y-auto">
        {submissions}
      </TabsContent>
    </Tabs>
  );
}

function DesktopWorkspace({ description, submissions, editor, console }: ProblemWorkspaceProps) {
  const outer = useDefaultLayout({ id: "problem-workspace", panelIds: ["left", "right"] });
  const inner = useDefaultLayout({ id: "problem-workspace-right", panelIds: ["editor", "console"] });

  return (
    <div className="h-full min-h-0 p-2">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={outer.defaultLayout}
        onLayoutChanged={outer.onLayoutChanged}
      >
        <ResizablePanel id="left" defaultSize="45%" minSize="30%" maxSize="65%">
          <div className={paneClasses}>
            <LeftTabs description={description} submissions={submissions} />
          </div>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize description and editor" />
        <ResizablePanel id="right" defaultSize="55%" minSize="35%">
          <ResizablePanelGroup
            orientation="vertical"
            defaultLayout={inner.defaultLayout}
            onLayoutChanged={inner.onLayoutChanged}
          >
            <ResizablePanel id="editor" defaultSize="58%" minSize="25%">
              <div className={paneClasses}>{editor}</div>
            </ResizablePanel>
            <ResizableHandle aria-label="Resize editor and console" />
            <ResizablePanel id="console" defaultSize="42%" minSize="20%" collapsible collapsedSize={42}>
              <div className={paneClasses}>{console}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function MobileWorkspace({
  description,
  submissions,
  editor,
  console,
  footer,
  mobileTab,
  onMobileTabChange,
}: ProblemWorkspaceProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        defaultValue="description"
        value={mobileTab}
        onValueChange={onMobileTabChange ? (value) => onMobileTabChange(value as MobileTab) : undefined}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList aria-label="Problem" className="sticky top-0 z-10 shrink-0 bg-card">
          <TabsTrigger value="description" className="h-11 flex-1">
            <FileTextIcon aria-hidden />
            Description
          </TabsTrigger>
          <TabsTrigger value="code" className="h-11 flex-1">
            <CodeIcon aria-hidden />
            Code
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="description"
          keepMounted
          className={cn("min-h-0 overflow-y-auto bg-card", footer && "pb-24")}
        >
          {description}
          <div className="border-t">{submissions}</div>
        </TabsContent>
        <TabsContent
          value="code"
          keepMounted
          className={cn("flex min-h-0 flex-col gap-2 overflow-y-auto bg-surface-sunken p-2", footer && "pb-24")}
        >
          <div className="h-[55dvh] shrink-0 overflow-hidden rounded-lg border bg-card">{editor}</div>
          <div className="min-h-64 shrink-0 overflow-hidden rounded-lg border bg-card">{console}</div>
        </TabsContent>
      </Tabs>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card p-2.5 px-4 shadow-md">{footer}</div>
      )}
    </div>
  );
}

/** SSR / hydration: the description in a pane, editor + console as skeletons on md+. */
function WorkspaceFallback({ description }: { description: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row md:gap-2 md:p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card md:flex-none md:basis-[calc(45%-4px)] md:rounded-lg md:border md:shadow-xs">
        <div className="flex h-10 shrink-0 items-stretch border-b px-2 max-md:h-11" aria-hidden>
          <span className="inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-foreground shadow-[inset_0_-2px_0_var(--primary)] max-md:flex-1 max-md:justify-center">
            <FileTextIcon className="size-4" />
            Description
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground max-md:flex-1 max-md:justify-center">
            <HistoryIcon className="size-4 max-md:hidden" />
            <CodeIcon className="size-4 md:hidden" />
            <span className="max-md:hidden">Submissions</span>
            <span className="md:hidden">Code</span>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{description}</div>
      </div>
      <div aria-hidden className="hidden min-w-0 flex-1 flex-col gap-2 md:flex">
        <div className="flex-[58] rounded-lg border bg-card p-4">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="flex-[42] rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    </div>
  );
}
