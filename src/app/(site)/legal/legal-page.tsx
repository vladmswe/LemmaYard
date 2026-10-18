import Link from "next/link";
import type { ReactNode } from "react";

import { PageHead } from "@/components/page-head";

/** Shared frame of the legal pages: head, draft note, prose. */
export function LegalPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHead crumbs={[{ label: "Home", href: "/" }, { label: title }]} title={title} subtitle={subtitle} />
      <div className="container-page pt-8 pb-14">
        <div className="prose-legal">
          <p className="legal-note">Draft for the owner&apos;s review; not legal advice.</p>
          {children}
          <p>
            See also: <Link href="/legal/terms">Terms of use</Link> · <Link href="/legal/privacy">Privacy notice</Link>{" "}
            · <Link href="/legal/content-policy">Content policy</Link> ·{" "}
            <Link href="/legal/report">Report content / copyright</Link>
          </p>
        </div>
      </div>
    </>
  );
}

/** CONTACT_EMAIL as a mailto link, or an honest placeholder when it is not configured. */
export function ContactEmail({ email }: { email: string | null }) {
  if (!email) {
    return <>the contact address set by the site owner (CONTACT_EMAIL is not configured)</>;
  }
  return <a href={`mailto:${email}`}>{email}</a>;
}
