// Global MDX components (required by @next/mdx in the App Router). Lesson
// MDX is styled by `.guide-prose` (guide.css); this file maps the elements
// that need behaviour and registers the lesson components. Components that
// need the current lesson's data (Quiz, ComplexityTable, PracticeLinks, Term)
// are passed by the lesson page; outside a lesson they fail loudly.
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";

import { Callout } from "@/components/guide/content/Callout";
import { CodeTabs } from "@/components/guide/content/CodeTabs";
import { Viz } from "@/components/guide/content/Viz";

function A({ href = "", children, ...rest }: ComponentProps<"a">) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

function needsLesson(name: string) {
  return function Missing(): never {
    throw new Error(`<${name}> can only be used inside a lesson page`);
  };
}

const components: MDXComponents = {
  a: A,
  // Wide tables and code scroll inside their own box (keyboard-focusable), never the page.
  table: (props: ComponentProps<"table">) => (
    <div className="guide-table-scroll" tabIndex={0} role="region" aria-label="Table">
      <table {...props} />
    </div>
  ),
  pre: (props: ComponentProps<"pre">) => <pre tabIndex={0} {...props} />,
  Viz,
  CodeTabs,
  Callout,
  Quiz: needsLesson("Quiz"),
  ComplexityTable: needsLesson("ComplexityTable"),
  PracticeLinks: needsLesson("PracticeLinks"),
  Term: needsLesson("Term"),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
