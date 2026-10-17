import { TrophyIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHead } from "@/components/page-head";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { formatMonthYear } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { findUserByUsername } from "@/server/users";

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} · leetcopy` };
}

// Placeholder until the profile lands in M6: page head is final, stat cards
// and progress replace the empty state.
export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [user, viewer] = await Promise.all([findUserByUsername(username), getCurrentUser()]);
  if (!user) notFound();
  const own = viewer?.id === user.id;

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: user.username }]}
        leading={<Avatar name={user.username} size="lg" />}
        title={user.username}
        subtitle={`Joined ${formatMonthYear(user.createdAt)}`}
      />
      <div className="container-page py-8">
        <EmptyState
          icon={TrophyIcon}
          title="Profile statistics are coming soon"
          action={
            own ? (
              <Link href="/problems" className={buttonVariants()}>
                Browse problems
              </Link>
            ) : undefined
          }
        >
          Solved problems by difficulty and recent activity will appear here.
        </EmptyState>
      </div>
    </>
  );
}
