"use client";

import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { cn } from "cn";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DESKTOP_QUERY, useMediaQuery } from "./use-media-query";

/**
 * Problem page layout (DESIGN.md §13.4; AC-M3-4, AC-M3-6). Slots:
 *
 * - `description`: left "Description" tab (server-rendered statement).
 * - `submissions`: left "Submissions" tab (M6 fills it).
 * - `discussion` / `discussionLabel` / `discussionMobile`: optional left
 *   "Discussion" tab (Community C1, only when COMMUNITY_ENABLED) with its
 *   streamed count; on mobile a link block under the statement instead.
 * - `editor`: right top, normally an `<EditorPane>` (Monaco + toolbar).
 * - `console`: right bottom, normally a `<ConsolePane>` (run results).
 * - `footer`: optional mobile-only fixed bar under the content (the Run /
 *   Submit action bar). When set, the mobile panels get bottom padding.
 * - `mobileTab` / `onMobileTabChange`: optional control of the mobile tab
 *   (Run/Submit in the action bar switch to "console"). Uncontrolled otherwise.
 *
 * >= 768px: an 8px sunken canvas with three 14px-radius panes and 8px
 * resizers: description 44% (30–65%) | editor 58% (min 25%) over console
 * 42% (min 20%, collapsible); sizes persist in localStorage.
 * < 768px: tabs Problem | Code | Console under the header (44px), each
 * filling the screen. The layout is chosen on the client, so each slot
 * mounts once; during SSR/hydration a static fallback shows the description.
 */
export type ProblemWorkspaceProps = {
  description: ReactNode;
  submissions: ReactNode;
  discussion?: ReactNode;
  discussionLabel?: ReactNode;
  discussionMobile?: ReactNode;
  editor: ReactNode;
  console: ReactNode;
  footer?: ReactNode;
  mobileTab?: MobileTab;
  onMobileTabChange?: (tab: MobileTab) => void;
};

export type MobileTab = "description" | "code" | "console";

const paneClasses = "h-full min-h-0 overflow-hidden rounded-lg border bg-card shadow-sm";

export function ProblemWorkspace(props: ProblemWorkspaceProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  if (desktop === null) {
    return <WorkspaceFallback description={props.description} hasDiscussion={props.discussion !== undefined} />;
  }
  return desktop ? <DesktopWorkspace {...props} /> : <MobileWorkspace {...props} />;
}

/** Left pane tabs: Description | Discussion (community) | Submissions (42px, DESIGN.md §12 Tabs). */
function LeftTabs({
  description,
  submissions,
  discussion,
  discussionLabel,
}: Pick<ProblemWorkspaceProps, "description" | "submissions" | "discussion" | "discussionLabel">) {
  return (
    <Tabs defaultValue="description" className="h-full min-h-0 gap-0">
      <TabsList aria-label="Problem" className="shrink-0 px-2">
        <TabsTrigger value="description" className="h-[42px]">
          Description
        </TabsTrigger>
        {discussion !== undefined && (
          <TabsTrigger value="discussion" className="h-[42px]" data-testid="discussion-tab-trigger">
            Discussion
            {discussionLabel}
          </TabsTrigger>
        )}
        <TabsTrigger value="submissions" className="h-[42px]">
          Submissions
        </TabsTrigger>
      </TabsList>
      <TabsContent value="description" keepMounted className="min-h-0 overflow-y-auto">
        {description}
      </TabsContent>
      {discussion !== undefined && (
        <TabsContent value="discussion" keepMounted className="min-h-0 overflow-y-auto">
          {discussion}
        </TabsContent>
      )}
      <TabsContent value="submissions" keepMounted className="min-h-0 overflow-y-auto">
        {submissions}
      </TabsContent>
    </Tabs>
  );
}

function DesktopWorkspace({ description, submissions, discussion, discussionLabel, editor, console }: ProblemWorkspaceProps) {
  const outer = useDefaultLayout({ id: "problem-workspace", panelIds: ["left", "right"] });
  const inner = useDefaultLayout({ id: "problem-workspace-right", panelIds: ["editor", "console"] });

  return (
    <div className="h-full min-h-0 p-2">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={outer.defaultLayout}
        onLayoutChanged={outer.onLayoutChanged}
      >
        <ResizablePanel id="left" defaultSize="44%" minSize="30%" maxSize="65%">
          <div className={paneClasses}>
            <LeftTabs
              description={description}
              submissions={submissions}
              discussion={discussion}
              discussionLabel={discussionLabel}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize description and editor" />
        <ResizablePanel id="right" defaultSize="56%" minSize="35%">
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

const MOBILE_TABS: { value: MobileTab; label: string }[] = [
  { value: "description", label: "Problem" },
  { value: "code", label: "Code" },
  { value: "console", label: "Console" },
];

function MobileWorkspace({
  description,
  submissions,
  discussionMobile,
  editor,
  console,
  footer,
  mobileTab,
  onMobileTabChange,
}: ProblemWorkspaceProps) {
  // The fixed action bar is ~72px (+ the judge-off note): keep content clear of it.
  const clear = footer ? "pb-24" : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        defaultValue="description"
        value={mobileTab}
        onValueChange={onMobileTabChange ? (value) => onMobileTabChange(value as MobileTab) : undefined}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList aria-label="Problem" className="sticky top-0 z-10 shrink-0 bg-background px-2">
          {MOBILE_TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="h-11 flex-1">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="description" keepMounted className={cn("min-h-0 overflow-y-auto bg-card", clear)}>
          {description}
          {discussionMobile}
          <div className="border-t">{submissions}</div>
        </TabsContent>
        <TabsContent value="code" keepMounted className={cn("flex min-h-0 flex-col bg-editor", clear)}>
          <div className="min-h-0 flex-1 overflow-hidden">{editor}</div>
        </TabsContent>
        <TabsContent value="console" keepMounted className={cn("flex min-h-0 flex-col bg-card", clear)}>
          <div className="min-h-0 flex-1 overflow-hidden">{console}</div>
        </TabsContent>
      </Tabs>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </div>
  );
}

/** SSR / hydration: the description in a pane, editor + console as skeletons on md+. */
function WorkspaceFallback({ description, hasDiscussion }: { description: ReactNode; hasDiscussion: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row md:gap-2 md:p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card md:flex-none md:basis-[calc(44%-4px)] md:rounded-lg md:border md:shadow-sm">
        <div className="flex h-11 shrink-0 items-stretch border-b px-2 md:h-[42px]" aria-hidden>
          <span className="inline-flex items-center gap-1.5 px-3.5 text-sm font-semibold text-foreground shadow-[inset_0_-2px_0_var(--primary)] max-md:flex-1 max-md:justify-center">
            <span className="max-md:hidden">Description</span>
            <span className="md:hidden">Problem</span>
          </span>
          {hasDiscussion && (
            <span className="inline-flex items-center gap-1.5 px-3.5 text-sm font-medium text-muted-foreground max-md:hidden">
              Discussion
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3.5 text-sm font-medium text-muted-foreground max-md:flex-1 max-md:justify-center">
            <span className="max-md:hidden">Submissions</span>
            <span className="md:hidden">Code</span>
          </span>
          <span className="inline-flex flex-1 items-center justify-center gap-1.5 px-3.5 text-sm font-medium text-muted-foreground md:hidden">
            Console
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{description}</div>
      </div>
      <div aria-hidden className="hidden min-w-0 flex-1 flex-col gap-2 md:flex">
        <div className="flex-[58] rounded-lg border bg-editor p-4">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="flex-[42] rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    </div>
  );
}
