import type { Metadata } from "next";

import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: "Page not found · leetcopy" };

// notFound() from a (site) page: header and footer come from (site)/layout.
export default function SiteNotFound() {
  return <NotFoundContent />;
}
