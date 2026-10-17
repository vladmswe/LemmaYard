import { Skeleton } from "@/components/ui/skeleton";

/** Loading shape of a submissions list (DESIGN.md §8.12): compact 40px rows. */
export function SubmissionsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" data-testid="submissions-skeleton">
      <span className="sr-only">Loading submissions…</span>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="h-10 border-b bg-surface-sunken" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-6 border-b px-4 last:border-0">
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
