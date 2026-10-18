import { requireCommunityPage } from "@/server/community/flags";

/** Community gate (AC-C-GEN-1): 404 before streaming while COMMUNITY_ENABLED is off. */
export default function ModerationLayout({ children }: LayoutProps<"/mod">) {
  requireCommunityPage();
  return <>{children}</>;
}
