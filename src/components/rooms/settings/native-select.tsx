// A native <select> with the field look of ui/input (DESIGN.md §12). Used
// for long option lists (time zones) and simple choices in the room
// settings, where the platform picker is the most usable on phones.
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "cn";

import { fieldClasses } from "@/components/ui/input";

export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className={cn(fieldClasses, "h-11 cursor-pointer appearance-none pr-10 pl-3.5 [color-scheme:inherit]")}
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
