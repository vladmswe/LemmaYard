import type { Metadata } from "next";

import { NOT_FOUND_TITLE, NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: NOT_FOUND_TITLE };

// notFound() from a (site) page: header and footer come from (site)/layout.
export default function SiteNotFound() {
  return <NotFoundContent />;
}
