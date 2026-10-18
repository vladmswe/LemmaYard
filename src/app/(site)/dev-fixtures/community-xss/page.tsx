import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UserMarkdown } from "@/components/community/user-markdown";
import { bodyProblem } from "@/lib/community/body";
import { XSS_CORPUS } from "@/lib/community/testing/xss-corpus";
import { isCommunityEnabled } from "@/server/community/flags";
import { getEnv } from "@/server/env";

import { fixturesEnabled } from "../../learn/dev-fixtures/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "XSS corpus · LemmaYard", robots: { index: false } };

/**
 * Playwright fixture (AC-C-MD-1, AC-C-MD-4): every XSS corpus payload through
 * the real server renderer, under the real CSP. The e2e spec fails on any
 * dialog, page error or CSP violation. 404 unless GUIDE_FIXTURES=1 (the
 * Playwright-only fixtures switch) and the community is enabled. Payloads the
 * body rules reject (e.g. 2 000 nested quotes) can never be stored, so they
 * are listed as rejected instead (the browser's own nesting limit would
 * otherwise reshape them and break hydration of this test page).
 */
export default async function CommunityXssFixture({ searchParams }: PageProps<"/dev-fixtures/community-xss">) {
  if (!fixturesEnabled(getEnv()) || !isCommunityEnabled()) notFound();
  // `?from=&to=` narrows the list (bisecting a failing payload by hand).
  const sp = await searchParams;
  const from = Number(typeof sp.from === "string" ? sp.from : 0) || 0;
  const to = Number(typeof sp.to === "string" ? sp.to : XSS_CORPUS.length) || XSS_CORPUS.length;
  return (
    <div className="container-page grid gap-6 py-10">
      <h1 className="display-2">XSS corpus</h1>
      <ol className="grid gap-4" data-testid="xss-corpus">
        {XSS_CORPUS.slice(from, to).map((p, i) => (
          <li key={i} className="overflow-hidden rounded-lg border bg-card p-4" data-testid="xss-case">
            <p className="mb-2 font-mono text-xs text-muted-foreground">{p.name}</p>
            {bodyProblem(p.md) === null ? (
              <UserMarkdown>{p.md}</UserMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">Rejected by the body rules: {bodyProblem(p.md)}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
