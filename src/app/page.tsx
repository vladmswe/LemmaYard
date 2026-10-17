import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Practice coding problems
      </h1>
      <p className="max-w-prose text-muted-foreground">
        Pick a problem, write a solution in Python or JavaScript, and get it
        judged in an isolated sandbox.
      </p>
      <Link href="/problems" className={buttonVariants()}>
        Browse problems
      </Link>
    </section>
  );
}
