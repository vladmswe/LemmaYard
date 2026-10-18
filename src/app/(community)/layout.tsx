import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Community pages that live under /problems (`/problems/[slug]/discuss`):
 * the same header + footer frame as (site), but outside (site)/problems,
 * whose loading.tsx would start streaming before the community gate can
 * answer a real 404 (AC-C-GEN-1).
 */
export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
