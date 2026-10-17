import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findUserByUsername } from "@/server/users";

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} · leetcopy` };
}

// Placeholder until the profile lands in M6.
export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const user = await findUserByUsername(username);
  if (!user) notFound();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{user.username}</h1>
      <p className="mt-2 text-muted-foreground">Profile statistics are coming soon.</p>
    </section>
  );
}
