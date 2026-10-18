import type { Metadata } from "next";
import Link from "next/link";

import { NOT_FOUND_TITLE, NotFoundContent } from "@/components/not-found-content";
import { buttonVariants } from "@/components/ui/button";

// generateMetadata returns nothing for an unknown slug, so the 404 tab title
// comes from here (it was the bare site title).
export const metadata: Metadata = { title: NOT_FOUND_TITLE };

// notFound() for a lesson slug that does not exist.
export default function LessonNotFound() {
  return (
    <NotFoundContent
      title="There is no such lesson."
      lead="The lesson may have been renamed, or the link is incorrect."
      actions={
        <Link href="/learn" className={buttonVariants({ className: "min-h-11" })}>
          All lessons
        </Link>
      }
    />
  );
}
