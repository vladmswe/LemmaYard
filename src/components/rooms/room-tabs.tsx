"use client";

import { useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DEFAULT_ROOM_TAB, ROOM_TAB_LABELS, ROOM_TABS, type RoomTab } from "./room-page-slots";

/**
 * Sessions | Leaderboard | Members, with the tab in `?tab=` (spec §7.4).
 * Panels are server-rendered and passed in; switching only rewrites the URL.
 */
export function RoomTabs({
  initialTab,
  sessions,
  leaderboard,
  members,
}: {
  initialTab: RoomTab;
  sessions: ReactNode;
  leaderboard: ReactNode;
  members: ReactNode;
}) {
  const [tab, setTab] = useState<RoomTab>(initialTab);
  const panels: Record<RoomTab, ReactNode> = { sessions, leaderboard, members };

  function onChange(value: unknown) {
    const next = ROOM_TABS.includes(value as RoomTab) ? (value as RoomTab) : DEFAULT_ROOM_TAB;
    setTab(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_ROOM_TAB) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <Tabs value={tab} onValueChange={onChange} className="gap-6">
      <TabsList aria-label="Room sections" className="overflow-x-auto">
        {ROOM_TABS.map((t) => (
          <TabsTrigger key={t} value={t}>
            {ROOM_TAB_LABELS[t]}
          </TabsTrigger>
        ))}
      </TabsList>
      {ROOM_TABS.map((t) => (
        <TabsContent key={t} value={t}>
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
