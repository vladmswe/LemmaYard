import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LemmaOfTheDayPanel } from "@/components/auth-aside";
import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/session";
import { getLemmaOfTheDay } from "@/server/landing";

export const metadata: Metadata = { title: "Log in · LemmaYard", description: "Log in to LemmaYard to keep practicing." };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next: rawNext } = await searchParams;
  const next = safeRedirectPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (await getCurrentUser()) redirect(next);

  const registerHref =
    next === DEFAULT_REDIRECT ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  const lemma = await getLemmaOfTheDay();

  return (
    <AuthCard
      title="Welcome back"
      aside={<LemmaOfTheDayPanel lemma={lemma} />}
      description="Log in to keep practicing."
      footer={
        <p>
          New here?{" "}
          <Link href={registerHref} className="relative font-semibold text-link underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2.5 hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      <AuthForm mode="login" next={next} />
    </AuthCard>
  );
}
