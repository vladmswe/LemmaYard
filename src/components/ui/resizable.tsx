"use client"

import { cn } from "cn"
import * as ResizablePrimitive from "react-resizable-panels"

// Split panes for the problem workspace (DESIGN.md §8.21). Not used yet.

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

/** 8px hit area with a 2x32px grip that turns primary on hover and drag. */
function ResizableHandle({
  className,
  ...props
}: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative flex w-2 shrink-0 items-center justify-center bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-ring aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full",
        className
      )}
      {...props}
    >
      <div className="h-8 w-0.5 rounded-full bg-border-strong transition-colors duration-120 group-hover/handle:bg-primary group-focus-visible/handle:bg-primary group-aria-[orientation=horizontal]/handle:h-0.5 group-aria-[orientation=horizontal]/handle:w-8" />
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
