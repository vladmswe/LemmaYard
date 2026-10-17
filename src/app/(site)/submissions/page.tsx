import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Submissions · leetcopy" };

// Placeholder until submission history lands in M6.
export default async function SubmissionsPage() {
  const user = await requireUser("/submissions");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
      <p className="mt-2 text-muted-foreground">
        Submission history for {user.username} is coming soon.
      </p>
    </section>
  );
}
