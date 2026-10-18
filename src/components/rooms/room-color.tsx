"use client";

// Room color tile and picker (docs/specs/rooms-v2.md §2.4, §2.5, §8): the
// tile shows the room's initial on its color (decorative: the name is always
// next to it); the picker is a radio group of the 8 palette colors, each
// with its color name for screen readers.
import { CheckIcon } from "lucide-react";
import { useId } from "react";
import { cn } from "cn";

import { ROOM_COLORS, roomColor, roomInitial } from "@/lib/rooms/room-colors";

export function RoomTile({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-testid="room-tile"
      className={cn(
        "inline-grid shrink-0 place-items-center text-on-room shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] select-none",
        roomColor(color).tile,
        size !== "sm" && "font-display",
        size === "sm" && "size-10 rounded-[12px] text-base font-semibold",
        size === "md" && "size-12 rounded-[14px] text-2xl",
        size === "lg" && "size-16 rounded-[18px] text-[2rem] min-[961px]:size-[72px] min-[961px]:rounded-[20px] min-[961px]:text-[2.125rem]",
        className,
      )}
    >
      {roomInitial(name)}
    </span>
  );
}

/** Radio group of the 8 colors; arrow keys move between them (native radios). */
export function RoomColorPicker({
  value,
  onChange,
  disabled,
  label = "Color",
}: {
  value: number;
  onChange: (color: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2" data-testid="room-color-picker">
        {ROOM_COLORS.map((c, i) => {
          const checked = value === i;
          return (
            <label
              key={c.name}
              className={cn(
                "relative grid size-10 cursor-pointer place-items-center rounded-[12px] text-on-room ring-offset-2 ring-offset-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                c.tile,
                checked && "ring-2 ring-foreground",
              )}
            >
              <input
                type="radio"
                name={`${id}-color`}
                value={i}
                checked={checked}
                onChange={() => onChange(i)}
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[inherit] opacity-0"
              />
              <span className="sr-only">{c.name}</span>
              {checked && <CheckIcon aria-hidden className="size-4" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
