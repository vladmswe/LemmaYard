"use client";

// Room data the v2 lobby needs besides the lobby view: the presets (tiles),
// the viewer's room role (owner-only preset saves) and every member's room
// rating (D3: all members see all ratings of the room). Read once from GET
// /api/rooms/:roomId (members only) and again after a preset save.
import { useCallback, useEffect, useState } from "react";

import type { SessionTemplate } from "@/lib/rooms/room-defaults";
import type { RoomRole } from "@/lib/rooms/types";

export type LobbyRoomInfo = {
  presets: SessionTemplate[];
  defaultPresetId: string;
  role: RoomRole;
  ratings: Map<string, { rating: number | null; provisional: boolean }>;
};

type RoomDetailWire = {
  room: { presets: SessionTemplate[]; defaultPresetId: string };
  viewer: { role: RoomRole };
  members: { userId: string; rating: { rating: number | null; provisional: boolean } }[];
};

export function parseRoomInfo(data: RoomDetailWire): LobbyRoomInfo {
  return {
    presets: data.room.presets,
    defaultPresetId: data.room.defaultPresetId,
    role: data.viewer.role,
    ratings: new Map(data.members.map((m) => [m.userId, { rating: m.rating.rating, provisional: m.rating.provisional }])),
  };
}

export function useRoomInfo(roomId: string, refreshKey: unknown): { info: LobbyRoomInfo | null; reload: () => void } {
  const [info, setInfo] = useState<LobbyRoomInfo | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<RoomDetailWire>) : null))
      .then((data) => {
        if (alive && data) setInfo(parseRoomInfo(data));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, nonce, refreshKey]);
  return { info, reload };
}
