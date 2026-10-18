import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UserMarkdown } from "@/components/community/user-markdown";
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
 * Playwright-only fixtures switch) and the community is enabled.
 */
export default function CommunityXssFixture() {
  if (!fixturesEnabled(getEnv()) || !isCommunityEnabled()) notFound();
  return (
    <div className="container-page grid gap-6 py-10">
      <h1 className="display-2">XSS corpus</h1>
      <ol className="grid gap-4" data-testid="xss-corpus">
        {XSS_CORPUS.map((p, i) => (
          <li key={i} className="overflow-hidden rounded-lg border bg-card p-4" data-testid="xss-case">
            <p className="mb-2 font-mono text-xs text-muted-foreground">{p.name}</p>
            <UserMarkdown>{p.md}</UserMarkdown>
          </li>
        ))}
      </ol>
    </div>
  );
}
