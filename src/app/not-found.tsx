import type { Metadata } from "next";

import { NOT_FOUND_TITLE, NotFoundContent } from "@/components/not-found-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: NOT_FOUND_TITLE };

// Unmatched URLs render here, inside the root layout only, so this page brings
// its own header and footer. notFound() inside (site) uses (site)/not-found.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </>
  );
}
