import type { Metadata } from "next";
import Link from "next/link";

import { requireCommunityPage } from "@/server/community/flags";

import { ContactEmail, LegalPage } from "../legal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report content / copyright · LemmaYard" };

export default function ReportPage() {
  const { contactEmail } = requireCommunityPage();
  return (
    <LegalPage
      title="Report content / copyright"
      subtitle="How to tell us about content that breaks the rules or the law, with or without an account."
    >
      <h2>With an account</h2>
      <p>
        Every comment has a <strong>Report</strong> button. Choose a reason (spam, harassment, personal data,
        copyright, an unmarked spoiler and others) and add details if they help. Moderators see reports in their
        queue; the person you report never learns who reported them.
      </p>
      <h2>Without an account</h2>
      <p>
        Anyone can report illegal content by email to <ContactEmail email={contactEmail} />. Please include:
      </p>
      <ul>
        <li>the exact URL of the content (open the full discussion and copy the link),</li>
        <li>why you think it is illegal or breaks the <Link href="/legal/content-policy">content policy</Link>,</li>
        <li>your name and email address, so we can answer,</li>
        <li>a statement that you report in good faith and that the information is accurate and complete.</li>
      </ul>
      <h2>Copyright notices</h2>
      <p>If you hold the rights to material posted here without permission, email the address above with:</p>
      <ul>
        <li>identification of the copyrighted work (for example a link to the original problem or editorial),</li>
        <li>the URL of the content on LemmaYard that copies it,</li>
        <li>
          a statement that you believe in good faith that the use is not authorized, and that the information in your
          notice is accurate,
        </li>
        <li>your name, contact details and your physical or electronic signature.</li>
      </ul>
      <h2>What happens next</h2>
      <p>
        We act on notices within 72 hours. Content named in a credible notice is hidden first, then we decide whether
        to remove it. The author can explain their side by email. Copyright and personal-data notices are answered
        within 24 hours where possible.
      </p>
    </LegalPage>
  );
}
