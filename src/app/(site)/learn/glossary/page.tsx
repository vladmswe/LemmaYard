import { BookMarkedIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHead } from "@/components/page-head";
import { publishedGlossary } from "@/content/learn/glossary";

export const metadata: Metadata = {
  title: "Glossary · Learn · LemmaYard",
  description: "Every term the data structures lessons define, with the lesson that introduces it.",
};

// Terms of published lessons, alphabetical (PLAN-GUIDE 2.8).
export default function GlossaryPage() {
  const items = publishedGlossary();
  return (
    <>
      <PageHead
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Learn", href: "/learn" },
          { label: "Glossary" },
        ]}
        title="Glossary"
        subtitle="Terms used in the data structures lessons."
      />
      <div className="container-page py-10">
        {items.length === 0 ? (
          <EmptyState icon={BookMarkedIcon} title="No terms yet" className="rounded-lg border">
            <p data-glossary-empty="">The glossary grows as lessons are published.</p>
          </EmptyState>
        ) : (
          <dl className="guide-glossary max-w-3xl">
            {items.map((t) => (
              <div key={t.id} className="guide-glossary-entry">
                <dt id={t.id} className="guide-glossary-term">
                  {t.term}
                </dt>
                <dd className="guide-glossary-def">
                  <p>{t.definition}</p>
                  <p className="text-sm text-muted-foreground">
                    Introduced in{" "}
                    <Link href={`/learn/${t.lesson.slug}`} className="guide-link">
                      {t.lesson.title}
                    </Link>
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </>
  );
}
