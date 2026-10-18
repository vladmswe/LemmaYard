import { Skeleton } from "@/components/ui/skeleton";

/** Loading shape of a submissions list (DESIGN.md §13.11): the table head and 56px rows. */
export function SubmissionsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" data-testid="submissions-skeleton">
      <span className="sr-only">Loading submissions…</span>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="h-11 border-b" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-6 border-b px-4 last:border-0">
            <Skeleton className="h-3.5 w-[12%]" />
            <Skeleton className="h-3.5 w-[30%]" />
            <Skeleton className="h-5 w-[14%] rounded-full" />
            <Skeleton className="ml-auto h-3.5 w-[8%]" />
            <Skeleton className="h-3.5 w-[8%]" />
          </div>
        ))}
      </div>
    </div>
  );
}
