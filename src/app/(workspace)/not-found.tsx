import type { Metadata } from "next";

import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: "Page not found · leetcopy" };

// notFound() from the problem page (unknown or unpublished slug): the compact
// header comes from (workspace)/layout; the 404 body scrolls in the workspace.
export default function WorkspaceNotFound() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <NotFoundContent />
    </div>
  );
}
