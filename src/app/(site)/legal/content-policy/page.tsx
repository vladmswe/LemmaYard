import type { Metadata } from "next";
import Link from "next/link";

import { requireCommunityPage } from "@/server/community/flags";

import { ContactEmail, LegalPage } from "../legal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Content policy · LemmaYard" };

export default function ContentPolicyPage() {
  const { contactEmail } = requireCommunityPage();
  return (
    <LegalPage title="Content policy" subtitle="What belongs in LemmaYard discussions, and what happens when something does not.">
      <h2>Welcome</h2>
      <ul>
        <li>Questions, explanations, approaches and complexity arguments.</li>
        <li>Short code that illustrates an idea.</li>
        <li>Interview experiences in your own words, with links to the problems.</li>
      </ul>
      <h2>Mark spoilers</h2>
      <p>
        If your comment contains a full solution or gives away the key idea, tick <strong>Contains a solution</strong>.
        Readers who have not solved the problem yet then see a card instead of your text, until they choose to show
        it.
      </p>
      <h2>Not allowed</h2>
      <ul>
        <li>Spam and advertising.</li>
        <li>Harassment, hate speech and threats.</li>
        <li>Personal data of other people, including the names of interviewers.</li>
        <li>Material covered by a non-disclosure agreement, and confidential documents.</li>
        <li>
          Problem statements or editorials copied from other sites. <strong>Link to them instead.</strong>
        </li>
        <li>Solutions written by someone else presented as your own.</li>
        <li>Requests for help cheating on live assessments.</li>
        <li>Malware and phishing links.</li>
        <li>Made-up interview reports, and AI-generated posts presented as a personal experience.</li>
      </ul>
      <h2>How we enforce it</h2>
      <p>
        Anyone can <Link href="/legal/report">report content</Link>. Content reported by three established members is
        hidden until a moderator looks at it. A moderator can then, depending on how serious it is:
      </p>
      <ol>
        <li>hide it,</li>
        <li>remove it with a reason,</li>
        <li>suspend the account from community features for 1, 7 or 30 days,</li>
        <li>ban the account.</li>
      </ol>
      <p>
        Every step is written to the audit log with its reason, and you see the reason on your own content. We aim to
        answer reports within 72 hours, and copyright or personal-data reports within 24 hours.
      </p>
      <h2>Appeals</h2>
      <p>
        If you think a decision was wrong, email <ContactEmail email={contactEmail} /> with a link to the content and
        why. A person reads every appeal.
      </p>
    </LegalPage>
  );
}
