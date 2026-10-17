import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route loading state (DESIGN.md §8.12): page head band + content shapes,
 * never a full-page spinner. `variant` picks the body shape.
 */
export function PageSkeleton({
  variant = "table",
  rows = 8,
  filters = false,
}: {
  variant?: "table" | "profile";
  rows?: number;
  /** A filter bar row (search + selects) above the table. */
  filters?: boolean;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="border-b bg-surface-sunken py-8">
        <div className="container-page">
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="flex items-center gap-4">
            {variant === "profile" && <Skeleton className="size-16 rounded-full" />}
            <div className="flex-1">
              <Skeleton className="h-9 w-56 max-w-full" />
              <Skeleton className="mt-3 h-4 w-72 max-w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="container-page py-8">
        {variant === "profile" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {filters && (
              <div className="mb-5 grid grid-cols-3 gap-3 md:grid-cols-[minmax(0,1fr)_repeat(3,9.5rem)]">
                <Skeleton className="col-span-3 h-10 md:col-span-1" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            )}
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="h-10 border-b bg-surface-sunken" />
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex h-12 items-center gap-6 border-b px-4 last:border-0">
                  <Skeleton className="h-3.5 w-[8%]" />
                  <Skeleton className="h-3.5 w-[52%]" />
                  <Skeleton className="ml-auto h-3.5 w-[12%]" />
                  <Skeleton className="h-3.5 w-[10%]" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
