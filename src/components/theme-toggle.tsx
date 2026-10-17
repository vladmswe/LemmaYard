"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

const noSubscribe = () => () => {};

/** "Theme: System" etc.; plain "Theme" until hydrated (the server can't know). */
export function themeButtonLabel(theme: string | undefined, hydrated: boolean): string {
  const current = THEMES.find((t) => t.value === (theme ?? "system"));
  return hydrated && current ? `Theme: ${current.label}` : "Theme";
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // false during SSR and hydration, true afterwards: no markup mismatch.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="header" size="icon" aria-label={themeButtonLabel(theme, hydrated)} />
        }
      >
        {/* Icons switch via CSS so server and client markup match. The
            visible one rotates in (CSS animation restarts on display change;
            next-themes only disables transitions while switching). */}
        <SunIcon className="size-5 animate-icon-in dark:hidden" />
        <MoonIcon className="hidden size-5 animate-icon-in dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => setTheme(String(value))}
        >
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {THEMES.map((t) => (
            <DropdownMenuRadioItem key={t.value} value={t.value}>
              <t.icon aria-hidden className="text-muted-foreground" />
              {t.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
