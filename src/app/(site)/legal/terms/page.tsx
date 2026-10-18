import type { Metadata } from "next";
import Link from "next/link";

import { requireCommunityPage } from "@/server/community/flags";

import { ContactEmail, LegalPage } from "../legal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of use · LemmaYard" };

export default function TermsPage() {
  const { contactEmail } = requireCommunityPage();
  return (
    <LegalPage title="Terms of use" subtitle="The rules for using LemmaYard and for what you post here.">
      <h2>Using the site</h2>
      <p>
        LemmaYard is a personal practice project: coding problems, an in-browser editor, a judge, a guide and, where
        it is turned on, problem discussions. You can use it for free. You are responsible for your account and for
        what you post with it.
      </p>
      <h2>Your content</h2>
      <p>
        You keep the copyright of everything you write here (comments, code and other posts). By posting it, you give
        LemmaYard a non-exclusive, worldwide, royalty-free license to host, store, display and adapt it for display
        (for example: render markdown, highlight code, hide a spoiler) on this site, for as long as it is posted.
      </p>
      <p>
        The source code of LemmaYard is released under the MIT license. That license covers the code in the
        repository only. It does <strong>not</strong> cover content posted by users.
      </p>
      <p>Only post what you have the right to post. Do not paste problem statements or editorials from other sites: link to them instead.</p>
      <h2>Acceptable use</h2>
      <p>
        Everything you post must follow the <Link href="/legal/content-policy">content policy</Link>. Do not try to
        break the site, the judge or other people&apos;s accounts, and do not automate posting or voting.
      </p>
      <h2>Moderation</h2>
      <p>
        Moderators may hide, remove or mark content as a spoiler, lock discussions, and suspend accounts from
        community features when the content policy is broken. Each action has a reason and is kept in an audit log.
        You can appeal a decision by email.
      </p>
      <h2>No warranty</h2>
      <p>
        The site is provided as is, without any warranty. It may change, be unavailable or lose data. Do not rely on
        it as the only copy of your work. To the extent the law allows, the operator is not liable for damages from
        using it.
      </p>
      <h2>Changes and contact</h2>
      <p>
        These terms may change; the current version is always on this page. Questions: <ContactEmail email={contactEmail} />.
      </p>
    </LegalPage>
  );
}
