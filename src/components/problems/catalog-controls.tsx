"use client";

import { SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "cn";

import { Chip, ChipCount, chipClasses } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import {
  type CatalogDifficulty,
  type CatalogFilters,
  type CatalogStatus,
  catalogHref,
  hasActiveFilters,
  MAX_QUERY_LENGTH,
} from "@/lib/catalog/filters";

// Catalog tool row (DESIGN.md §13.3): every filter lives in the URL. The
// search applies on Enter and after a 300ms pause ("/" focuses it); the
// segmented controls and topic chips apply at once. Navigations run in a
// transition, so the current results stay visible (dimmed, aria-busy) until
// the new page arrives.

const PendingContext = createContext<{
  isPending: boolean;
  navigate: (href: string, opts?: { replace?: boolean }) => void;
}>({ isPending: false, navigate: () => {} });

/** Wraps the filter bar and the results; owns the navigation transition. */
export function CatalogShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigate = (href: string, opts?: { replace?: boolean }) =>
    startTransition(() => {
      if (opts?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  return <PendingContext value={{ isPending, navigate }}>{children}</PendingContext>;
}

/** The results region: dimmed and aria-busy while a filter change loads. */
export function CatalogResultsRegion({ children }: { children: ReactNode }) {
  const { isPending } = useContext(PendingContext);
  return (
    <div
      aria-busy={isPending || undefined}
      className={cn("mt-4 transition-opacity duration-180", isPending && "opacity-60")}
    >
      {children}
    </div>
  );
}

export type TopicOption = { value: string; label: string; count: number };

const DIFFICULTY_OPTIONS: SegmentedOption<CatalogDifficulty | "all">[] = [
  { value: "all", label: "All" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const STATUS_OPTIONS: SegmentedOption<CatalogStatus | "any">[] = [
  {
    value: "any",
    // One flex item (the button has a gap): "Any status", "Any" on phones.
    label: (
      <span>
        Any<span className="max-sm:hidden"> status</span>
      </span>
    ),
  },
  { value: "solved", label: "Solved" },
  { value: "attempted", label: "Attempted" },
  { value: "todo", label: "To do" },
];

const DIFFICULTY_LABELS: Record<CatalogDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const STATUS_LABELS: Record<CatalogStatus, string> = { solved: "Solved", attempted: "Attempted", todo: "To do" };

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);

export function CatalogFilterBar({
  filters,
  tags,
  showStatus,
}: {
  filters: CatalogFilters;
  tags: TopicOption[];
  /** Signed-in users only (AC-M3-2). */
  showStatus: boolean;
}) {
  const { navigate } = useContext(PendingContext);

  const chips: { key: string; label: string; href: string }[] = [];
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, href: catalogHref(filters, { q: undefined }) });
  if (filters.difficulty) {
    chips.push({
      key: "difficulty",
      label: DIFFICULTY_LABELS[filters.difficulty],
      href: catalogHref(filters, { difficulty: undefined }),
    });
  }
  if (filters.tag) {
    const label = tags.find((t) => t.value === filters.tag)?.label ?? filters.tag;
    chips.push({ key: "tag", label, href: catalogHref(filters, { tag: undefined }) });
  }
  if (showStatus && filters.status) {
    chips.push({
      key: "status",
      label: STATUS_LABELS[filters.status],
      href: catalogHref(filters, { status: undefined }),
    });
  }

  // A fragment: the sticky row must be a direct child of the long page column.
  return (
    <>
      {/* Sticky under the header from 961px (z: header 40 > tool row 5 > table
          head); on phones the stacked controls would cover a third of the screen. */}
      <div
        data-testid="catalog-tools"
        className="-mx-[var(--pad)] flex flex-wrap items-center gap-x-3 gap-y-2.5 bg-background px-[var(--pad)] py-3 min-[961px]:sticky min-[961px]:top-17 min-[961px]:z-5"
      >
        <SearchBox
          filters={filters}
          onSearch={(q, replace) => navigate(catalogHref(filters, { q: q || undefined }), { replace })}
        />
        <Segmented
          label="Difficulty"
          size="lg"
          options={DIFFICULTY_OPTIONS}
          value={filters.difficulty ?? "all"}
          onValueChange={(v) => navigate(catalogHref(filters, { difficulty: v === "all" ? undefined : v }))}
          className="max-sm:flex-1 max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center"
        />
        {showStatus && (
          <Segmented
            label="Status"
            size="lg"
            options={STATUS_OPTIONS}
            value={filters.status ?? "any"}
            onValueChange={(v) => navigate(catalogHref(filters, { status: v === "any" ? undefined : v }))}
            className="max-sm:flex-1 max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center max-sm:[&>button]:px-2"
          />
        )}
      </div>

      {tags.length > 0 && (
        // One scrolling row on phones, wrapped rows from 640px.
        <div
          role="group"
          aria-label="Topics"
          className="-mx-[var(--pad)] mt-1 flex gap-2 overflow-x-auto px-[var(--pad)] py-1.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible"
        >
          <Chip
            pressed={!filters.tag}
            onClick={() => navigate(catalogHref(filters, { tag: undefined }))}
            className="relative after:absolute after:inset-x-0 after:-inset-y-[3px]"
          >
            All topics
          </Chip>
          {tags.map((t) => {
            const active = filters.tag === t.value;
            return (
              <Chip
                key={t.value}
                pressed={active}
                onClick={() => navigate(catalogHref(filters, { tag: active ? undefined : t.value }))}
                className="relative after:absolute after:inset-x-0 after:-inset-y-[3px]"
              >
                {t.label}
                <ChipCount>
                  <span className="sr-only">(</span>
                  {t.count}
                  <span className="sr-only"> problems)</span>
                </ChipCount>
              </Chip>
            );
          })}
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by</span>
          <ul className="contents">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chip.href}
                  scroll={false}
                  aria-label={`Remove filter: ${chip.label}`}
                  className={chipClasses(
                    "relative h-8 border-transparent bg-secondary pr-2 pl-3 text-[0.8125rem] font-semibold text-secondary-foreground after:absolute after:inset-x-0 after:-inset-y-1 hover:border-transparent hover:bg-highlight hover:text-secondary-foreground",
                  )}
                >
                  {chip.label}
                  <XIcon aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {hasActiveFilters(filters) && (
            <Link
              href={catalogHref({ page: 1 })}
              scroll={false}
              className="ml-1 inline-flex min-h-10 items-center font-medium text-link underline-offset-4 hover:underline"
            >
              Clear all
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function SearchBox({
  filters,
  onSearch,
}: {
  filters: CatalogFilters;
  onSearch: (q: string, replace: boolean) => void;
}) {
  const current = filters.q ?? "";
  const [value, setValue] = useState(current);
  const [synced, setSynced] = useState(current);
  // The last query this box sent; the URL catching up to it is not an
  // outside change (the user may already have typed further).
  const [sent, setSent] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The URL changed from elsewhere (chip removed, Clear all, back button):
  // show its query unless the box already holds the same text.
  if (synced !== current) {
    setSynced(current);
    if (current !== sent && normalize(value) !== current) setValue(current);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  // "/" focuses the search unless the user is typing somewhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const apply = (next: string, replace: boolean) => {
    clearTimeout(timer.current);
    const q = normalize(next);
    if (q === current) return;
    setSent(q);
    onSearch(q, replace);
  };

  return (
    <form
      role="search"
      className="relative w-full min-[961px]:w-[22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        apply(value, false);
      }}
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        name="q"
        aria-label="Search problems by title"
        aria-keyshortcuts="/"
        placeholder="Search by title"
        autoComplete="off"
        maxLength={MAX_QUERY_LENGTH}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => apply(next, true), 300);
        }}
        className="pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden"
      />
      <span aria-hidden className="kbd pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 max-[960px]:hidden">
        /
      </span>
    </form>
  );
}
