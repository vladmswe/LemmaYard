import type { Metadata } from "next";

import { requireCommunityPage } from "@/server/community/flags";

import { ContactEmail, LegalPage } from "../legal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy notice · LemmaYard" };

export default function PrivacyPage() {
  const { contactEmail } = requireCommunityPage();
  return (
    <LegalPage title="Privacy notice" subtitle="What LemmaYard stores about you, who can see it and for how long.">
      <h2>What we store</h2>
      <ul>
        <li>Your account: email address, username and a hash of your password (never the password itself).</li>
        <li>Your submissions: the code you run or submit and the judge&apos;s results.</li>
        <li>
          Community content: your comments (and later posts), with your account as the author. This includes posts
          shown as anonymous, so moderators can act on them.
        </li>
        <li>Your votes on comments and problems, and your difficulty feedback.</li>
        <li>Reports you file (target, reason, optional details) and moderation actions on your content.</li>
      </ul>
      <p>
        Community features store <strong>no IP addresses and no user agents</strong>. Their limits are counted per
        account. The login rate limit keeps addresses in memory only, for a short time.
      </p>
      <h2>Who can see what</h2>
      <p>Public: your username next to your comments, net vote scores and comment counts.</p>
      <p>
        Never public: who voted on what, who reported what (the reported person never learns who it was), the author
        of anonymous posts, and your email address. Moderators can see reports and authors to do their job.
      </p>
      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and content: until you ask us to delete them.</li>
        <li>Bodies of removed comments and earlier versions of edited comments: 90 days, then deleted.</li>
        <li>Moderation actions (the audit log): 1 year.</li>
      </ul>
      <h2>Your requests</h2>
      <p>
        Until self-service export and deletion exist, email <ContactEmail email={contactEmail} /> from the address of
        your account to get a copy of your data or to delete your account and content.
      </p>
      <h2>Cookies</h2>
      <p>
        LemmaYard sets one cookie: the session cookie that keeps you logged in. There are no tracking or advertising
        cookies. Editor drafts are kept in your browser&apos;s local storage and never leave your device.
      </p>
    </LegalPage>
  );
}
