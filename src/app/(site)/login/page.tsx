import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Log in · leetcopy" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next: rawNext } = await searchParams;
  const next = safeRedirectPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (await getCurrentUser()) redirect(next);

  const registerHref =
    next === DEFAULT_REDIRECT ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Welcome back"
      description="Log in to keep practicing."
      footer={
        <p>
          New here?{" "}
          <Link href={registerHref} className="font-semibold text-link underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      <AuthForm mode="login" next={next} />
    </AuthCard>
  );
}
