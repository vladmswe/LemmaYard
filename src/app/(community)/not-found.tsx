import type { Metadata } from "next";

import { NOT_FOUND_TITLE, NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: NOT_FOUND_TITLE };

// notFound() from a (community) page: header and footer come from (community)/layout.
export default function CommunityNotFound() {
  return <NotFoundContent />;
}
