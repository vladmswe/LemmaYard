"use client";

import { FlaskConicalIcon, TerminalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ConsoleTab = "testcase" | "result";

/**
 * Console slot of the problem workspace (DESIGN.md §8.22), M5 contract:
 *
 * - `testcase`: body of the Testcase tab (custom input editor).
 * - `result`: body of the Result tab (verdict, cases). The tab body is the
 *   `aria-live="polite"` region; render only the final state into it.
 * - `tab` / `onTabChange`: controlled selected tab (switch to "result" when a
 *   run starts). Uncontrolled (starts on "testcase") when `tab` is omitted.
 *
 * Omitted bodies render the idle placeholders. Both tab bodies stay mounted
 * and scroll inside the pane (`p-4 md:px-5`).
 */
export type ConsolePaneProps = {
  testcase?: ReactNode;
  result?: ReactNode;
  tab?: ConsoleTab;
  onTabChange?: (tab: ConsoleTab) => void;
  className?: string;
};

export function ConsolePane({ testcase, result, tab, onTabChange, className }: ConsolePaneProps) {
  return (
    <Tabs
      data-slot="console-pane"
      defaultValue="testcase"
      value={tab}
      onValueChange={onTabChange ? (value) => onTabChange(value as ConsoleTab) : undefined}
      className={cn("flex h-full min-h-0 flex-col gap-0 bg-card", className)}
    >
      <TabsList aria-label="Console" className="shrink-0 px-2">
        <TabsTrigger value="testcase">
          <FlaskConicalIcon aria-hidden />
          Testcase
        </TabsTrigger>
        <TabsTrigger value="result">
          <TerminalIcon aria-hidden />
          Result
        </TabsTrigger>
      </TabsList>
      <TabsContent value="testcase" keepMounted className="min-h-0 overflow-auto p-4 md:px-5">
        {testcase ?? (
          <p className="text-sm text-muted-foreground">
            Custom test input will be editable here once running code is available.
          </p>
        )}
      </TabsContent>
      <TabsContent
        value="result"
        keepMounted
        aria-live="polite"
        className="min-h-0 overflow-auto p-4 md:px-5"
      >
        {result ?? <p className="text-sm text-muted-foreground">Run your code to see results here.</p>}
      </TabsContent>
    </Tabs>
  );
}
