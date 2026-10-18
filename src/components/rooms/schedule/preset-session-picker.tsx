"use client";

// "New session" from a preset (Rooms v2 §4): the room's default preset is
// preselected; with more than one preset a select picks another. The lobby
// opens with the preset's settings (problem count, duration, mode, …).
import { useId, useState } from "react";

import { Label } from "@/components/ui/label";
import { presetSummary } from "@/lib/rooms/preset-form";
import type { SessionTemplate } from "@/lib/rooms/room-defaults";

import { NativeSelect } from "../settings/native-select";
import { OpenLobbyButton } from "./open-lobby-button";

export function PresetSessionPicker({
  roomId,
  presets,
  defaultPresetId,
}: {
  roomId: string;
  presets: SessionTemplate[];
  defaultPresetId: string;
}) {
  const id = useId();
  const [presetId, setPresetId] = useState(defaultPresetId);
  const chosen = presets.find((p) => p.id === presetId) ?? presets[0];
  return (
    <div className="flex flex-wrap items-end gap-3">
      {presets.length > 1 ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-80">
          <Label htmlFor={`${id}-preset`}>Preset</Label>
          <NativeSelect
            id={`${id}-preset`}
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            data-testid="new-session-preset"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === defaultPresetId ? " (default)" : ""} · {presetSummary(p)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        chosen && <p className="min-w-0 flex-1 text-sm text-foreground-secondary">{presetSummary(chosen)}</p>
      )}
      <OpenLobbyButton roomId={roomId} presetId={chosen?.id} testId="new-session">
        New session
      </OpenLobbyButton>
    </div>
  );
}
