import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign up · leetcopy" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next: rawNext } = await searchParams;
  const next = safeRedirectPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (await getCurrentUser()) redirect(next);

  const loginHref =
    next === DEFAULT_REDIRECT ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Create your account"
      description="Free. Track your progress as you go."
      footer={
        <p>
          Already have an account?{" "}
          <Link href={loginHref} className="font-semibold text-link underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      }
    >
      <AuthForm mode="register" next={next} />
    </AuthCard>
  );
}
