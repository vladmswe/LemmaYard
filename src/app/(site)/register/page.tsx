import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WhatYouGetPanel } from "@/components/auth-aside";
import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign up · LemmaYard",
  description: "Create a free LemmaYard account to track solved problems, keep every submission and join rooms.",
};

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next: rawNext } = await searchParams;
  const next = safeRedirectPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (await getCurrentUser()) redirect(next);

  const loginHref =
    next === DEFAULT_REDIRECT ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Start your first proof"
      description="Create a free account. Track your progress as you go."
      aside={<WhatYouGetPanel />}
      footer={
        <p>
          Already have an account?{" "}
          <Link href={loginHref} className="relative font-semibold text-link underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3 hover:underline">
            Log in
          </Link>
        </p>
      }
    >
      <AuthForm mode="register" next={next} />
    </AuthCard>
  );
}
