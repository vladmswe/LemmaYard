import { requireCommunityPage } from "@/server/community/flags";

/**
 * Community gate (AC-C-GEN-1): with COMMUNITY_ENABLED off this route is a real
 * 404. Checked here, before streaming starts; a `notFound()` from the page's
 * streamed metadata alone would arrive after a 200 status line.
 */
export default function DiscussLayout({ children }: LayoutProps<"/problems/[slug]/discuss">) {
  requireCommunityPage();
  return <>{children}</>;
}
