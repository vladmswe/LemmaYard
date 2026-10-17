"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}

/**
 * The theme actually applied ("light" | "dark", undefined before hydration).
 * next-themes' `resolvedTheme` ignores `forcedTheme` (it reports the stored
 * choice), so theme-aware code (Monaco, toasts) must read this instead.
 */
export function useAppliedTheme(): string | undefined {
  const { forcedTheme, resolvedTheme } = useTheme();
  return forcedTheme ?? resolvedTheme;
}
