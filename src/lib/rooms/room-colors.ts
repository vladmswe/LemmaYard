// The 8 room colors (docs/specs/rooms-v2.md §8 `rooms.color` 0..7). Pure:
// the index is stored, the UI maps it to a token (`--room-0` … `--room-7`
// in globals.css, white text ≥ 4.5:1, checked in tests/unit/contrast.test.ts).
// Literal class strings only (DESIGN.md §14: no dynamic class names).
import { ROOM_COLOR_COUNT } from "./room-defaults";

export const ROOM_COLORS = [
  { name: "Cobalt", tile: "bg-room-0" },
  { name: "Green", tile: "bg-room-1" },
  { name: "Plum", tile: "bg-room-2" },
  { name: "Amber", tile: "bg-room-3" },
  { name: "Teal", tile: "bg-room-4" },
  { name: "Red", tile: "bg-room-5" },
  { name: "Violet", tile: "bg-room-6" },
  { name: "Slate", tile: "bg-room-7" },
] as const satisfies readonly { name: string; tile: string }[];

if (ROOM_COLORS.length !== ROOM_COLOR_COUNT) throw new Error("ROOM_COLORS must list every palette index");

/** A stored index → its palette entry (unknown values fall back to Cobalt). */
export function roomColor(index: number | null | undefined) {
  return ROOM_COLORS[Number.isInteger(index) && index! >= 0 && index! < ROOM_COLORS.length ? index! : 0];
}

/** The tile letter: the first letter or digit of the name, upper case ("S"). */
export function roomInitial(name: string): string {
  const ch = [...name.trim()].find((c) => /[\p{L}\p{N}]/u.test(c));
  return ch ? ch.toLocaleUpperCase("en-US") : "#";
}
