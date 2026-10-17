import type { Metadata } from "next";

import { NotFoundContent } from "@/components/not-found-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Page not found · LemmaYard" };

// Unmatched URLs render here, inside the root layout only, so this page brings
// its own header and footer. notFound() inside (site) uses (site)/not-found.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </>
  );
}
