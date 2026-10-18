import { QedLoader } from "@/components/brand/qed-loader";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route loading state (DESIGN.md §13.11): copies the page head + content
 * shapes (sunken blocks, shimmer by transform), with the ∎ loader beside
 * "Loading…"; never a full-page spinner. `variant` picks the body shape.
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
      <div className="border-b py-10 min-[961px]:py-14">
        <div className="container-page">
          <p className="mb-4 flex items-center gap-2.5 text-sm text-muted-foreground">
            <QedLoader className="size-3 text-primary" />
            Loading…
          </p>
          <div className="flex items-center gap-4">
            {variant === "profile" && <Skeleton className="size-16 rounded-[18px]" />}
            <div className="flex-1">
              <Skeleton className="h-12 w-64 max-w-full rounded-lg" />
              <Skeleton className="mt-3 h-4 w-72 max-w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="container-page py-8">
        {variant === "profile" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {filters && (
              // The catalog tool row (search, two segmented controls) and the topic chips.
              <div className="mb-5">
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-11 w-full min-[961px]:w-[22rem]" />
                  <Skeleton className="h-11 w-64 rounded-full" />
                  <Skeleton className="h-11 w-80 max-w-full rounded-full" />
                </div>
                <div className="mt-4 flex gap-2 overflow-hidden">
                  {[96, 80, 88, 120, 72, 104].map((w, i) => (
                    <Skeleton key={i} className="h-[34px] shrink-0 rounded-full" style={{ width: w }} />
                  ))}
                </div>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="h-11 border-b" />
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-6 border-b px-4 last:border-0">
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
