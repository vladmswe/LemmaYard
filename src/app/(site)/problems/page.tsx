import type { Metadata } from "next";

export const metadata: Metadata = { title: "Problems · leetcopy" };

// Placeholder until the catalog lands in M3.
export default function ProblemsPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
      <p className="mt-2 text-muted-foreground">The problem catalog is coming soon.</p>
    </section>
  );
}
