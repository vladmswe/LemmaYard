import type { Metadata } from "next";

import { PageHead } from "@/components/page-head";
import { DIFFICULTY_BANDS } from "@/lib/leetcode/difficulty";
import { DATASET_LICENCE_TEXT, LEETCODE_NOT_AFFILIATED } from "@/lib/leetcode/labels";
import { DATASET_URL } from "@/lib/leetcode/catalog-schema";
import { getLeetCodeCatalog } from "@/server/leetcode/catalog";

export const metadata: Metadata = {
  title: "Third-party notices · LemmaYard",
  description: "Attribution and licences of third-party data used by LemmaYard.",
};

export const dynamic = "force-dynamic";

/**
 * Third-party notices (docs/specs/leetcode-integration.md §6.8): the LeetCode
 * rating dataset's MIT notice and the not-affiliated line. Public page.
 */
export default function NoticesPage() {
  const catalog = getLeetCodeCatalog();
  return (
    <>
      <PageHead crumbs={[{ label: "Third-party notices" }]} title="Third-party notices" />
      <div className="container-page flex max-w-3xl flex-col gap-6 py-8">
        <section aria-labelledby="leetcode-ratings" className="flex flex-col gap-3">
          <h2 id="leetcode-ratings" className="text-xl/7 font-semibold">
            LeetCode problem ratings
          </h2>
          <p>
            Rooms can pick LeetCode contest problems automatically. The list of problems (number, title, link name,
            contest) and their community contest ratings come from the dataset{" "}
            <a href={DATASET_URL} className="text-link underline underline-offset-2" rel="noopener noreferrer" referrerPolicy="no-referrer">
              zerotrac/leetcode_problem_rating
            </a>{" "}
            (MIT licence).
            {catalog && (
              <>
                {" "}
                This site uses dataset commit <code className="font-mono text-sm break-all">{catalog.source.commit}</code>,
                retrieved {catalog.source.retrievedAt}.
              </>
            )}
          </p>
          <p>
            LemmaYard stores no problem statements, examples, hints, solutions or tests, and never requests anything from
            leetcode.com: a LeetCode problem in a room is a link that opens in your own browser. The difficulty shown for
            these problems is estimated from the rating (below {DIFFICULTY_BANDS.mediumFrom}: Easy, below{" "}
            {DIFFICULTY_BANDS.hardFrom}: Medium, else Hard), and topic tags are LemmaYard&apos;s own estimates.
          </p>
          <p className="font-medium">{LEETCODE_NOT_AFFILIATED}</p>
          <pre
            className="overflow-x-auto rounded-md border bg-surface-sunken p-4 font-mono text-xs whitespace-pre-wrap"
            data-testid="mit-notice"
          >
            {DATASET_LICENCE_TEXT}
          </pre>
        </section>
      </div>
    </>
  );
}
