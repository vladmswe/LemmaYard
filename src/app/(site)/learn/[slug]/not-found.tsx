import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// notFound() for a lesson slug that does not exist.
export default function LessonNotFound() {
  return (
    <div className="container-page py-24 text-center sm:py-32">
      <p className="eyebrow mb-3">404</p>
      <h1 className="font-heading text-3xl/[2.375rem] font-semibold tracking-[-0.015em] text-balance sm:text-4xl/11">
        There is no such lesson
      </h1>
      <p className="mx-auto mt-4 max-w-md text-foreground-secondary">
        The lesson may have been renamed, or the link is incorrect.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/learn" className={buttonVariants({ className: "min-h-11" })}>
          All lessons
        </Link>
      </div>
    </div>
  );
}
