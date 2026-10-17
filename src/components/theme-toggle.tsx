"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef, useSyncExternalStore } from "react";

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

/**
 * Switches the theme with a circular reveal from the toggle (View
 * Transitions, DESIGN.md §11.2); an instant swap without support or under
 * reduced motion.
 */
function switchTheme(setTheme: (t: string) => void, next: string, origin: HTMLElement | null) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced || !origin) {
    setTheme(next);
    return;
  }
  const r = origin.getBoundingClientRect();
  const root = document.documentElement;
  root.style.setProperty("--vt-x", `${r.left + r.width / 2}px`);
  root.style.setProperty("--vt-y", `${r.top + r.height / 2}px`);
  root.classList.add("theme-vt");
  void doc.startViewTransition(() => setTheme(next)).finished.finally(() => root.classList.remove("theme-vt"));
}

/**
 * Light / Dark / System menu. Rendered only while THEME_TOGGLE_ENABLED is
 * true (src/lib/theme-config.ts); the site is dark-only otherwise.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // false during SSR and hydration, true afterwards: no markup mismatch.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button ref={triggerRef} variant="secondary" size="icon" aria-label={themeButtonLabel(theme, hydrated)} />
        }
      >
        {/* Icons switch via CSS so server and client markup match. The
            visible one rotates in (CSS animation restarts on display change;
            next-themes only disables transitions while switching). */}
        <SunIcon className="size-[18px] animate-icon-in dark:hidden" />
        <MoonIcon className="hidden size-[18px] animate-icon-in dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => switchTheme(setTheme, String(value), triggerRef.current)}
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
