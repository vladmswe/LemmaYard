"use client";

import { usePathname } from "next/navigation";

/** The current URL path as inline code (404 lead); `fallback` before it is known. */
export function CurrentPath({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  if (!pathname) return <>{fallback}</>;
  return (
    <code className="rounded-sm border bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.85em] break-all text-foreground">
      {pathname}
    </code>
  );
}
