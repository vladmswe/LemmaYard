import { PageSkeleton } from "@/components/page-skeleton";

// The only loading.tsx on purpose. A loading boundary streams the page shell
// first, so the response is already HTTP 200 when the page later calls
// notFound() or redirect(). Every other (site) route either requires a session
// (requireUser → 307 to /login), can answer 404 (unknown user, room, session,
// submission, lesson), or has no data to wait for (/learn, /learn/glossary).
// Putting one on a parent segment (e.g. /learn or (site)) would cover those
// children too. The catalog never 404s or redirects, so a skeleton is safe here.
export default function Loading() {
  return <PageSkeleton rows={10} filters />;
}
