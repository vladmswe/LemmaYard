"use client";

import { SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "cn";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type CatalogFilters,
  catalogHref,
  hasActiveFilters,
  MAX_QUERY_LENGTH,
} from "@/lib/catalog/filters";

// Catalog filter bar (DESIGN.md §9.3): every filter lives in the URL. The
// search applies on Enter and after a 300ms pause; selects apply at once.
// Navigations run in a transition, so the current results stay visible
// (dimmed, aria-busy) until the new page arrives.

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
      className={cn("transition-opacity duration-180", isPending && "opacity-60")}
    >
      {children}
    </div>
  );
}

export type FilterOption = { value: string; label: string };

const DIFFICULTY_OPTIONS: FilterOption[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: "solved", label: "Solved" },
  { value: "attempted", label: "Attempted" },
  { value: "todo", label: "Not started" },
];

const ALL = "__all__";

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);

export function CatalogFilterBar({
  filters,
  tags,
  showStatus,
}: {
  filters: CatalogFilters;
  tags: FilterOption[];
  /** Signed-in users only (AC-M3-2). */
  showStatus: boolean;
}) {
  const { navigate } = useContext(PendingContext);
  const tagLabel = (slug: string) => tags.find((t) => t.value === slug)?.label ?? slug;

  const chips: { key: string; label: string; href: string }[] = [];
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, href: catalogHref(filters, { q: undefined }) });
  if (filters.difficulty) {
    chips.push({
      key: "difficulty",
      label: DIFFICULTY_OPTIONS.find((o) => o.value === filters.difficulty)!.label,
      href: catalogHref(filters, { difficulty: undefined }),
    });
  }
  if (filters.tag) {
    chips.push({ key: "tag", label: tagLabel(filters.tag), href: catalogHref(filters, { tag: undefined }) });
  }
  if (showStatus && filters.status) {
    chips.push({
      key: "status",
      label: STATUS_OPTIONS.find((o) => o.value === filters.status)!.label,
      href: catalogHref(filters, { status: undefined }),
    });
  }

  return (
    <div className="mb-5">
      <div
        className={cn(
          "grid grid-cols-3 gap-3",
          showStatus ? "md:grid-cols-[minmax(0,1fr)_repeat(3,9.5rem)]" : "md:grid-cols-[minmax(0,1fr)_repeat(2,9.5rem)]",
        )}
      >
        <SearchBox
          filters={filters}
          onSearch={(q, replace) => navigate(catalogHref(filters, { q: q || undefined }), { replace })}
        />
        <FilterSelect
          label="Difficulty"
          allLabel="All difficulties"
          value={filters.difficulty}
          options={DIFFICULTY_OPTIONS}
          onChange={(v) => navigate(catalogHref(filters, { difficulty: v }))}
        />
        <FilterSelect
          label="Topic"
          allLabel="All topics"
          value={filters.tag}
          options={tags}
          onChange={(v) => navigate(catalogHref(filters, { tag: v }))}
        />
        {showStatus && (
          <FilterSelect
            label="Status"
            allLabel="All statuses"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(v) => navigate(catalogHref(filters, { status: v }))}
          />
        )}
      </div>
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
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pr-1.5 pl-2.5 text-[0.8125rem] font-semibold text-secondary-foreground transition-colors duration-120 hover:bg-blue-200 dark:hover:bg-[#24385f]"
                >
                  {chip.label}
                  <XIcon aria-hidden className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
          {hasActiveFilters(filters) && (
            <Link
              href={catalogHref({ page: 1 })}
              scroll={false}
              className="ml-1 font-medium text-link underline-offset-4 hover:underline"
            >
              Clear all
            </Link>
          )}
        </div>
      )}
    </div>
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

  // The URL changed from elsewhere (chip removed, Clear all, back button):
  // show its query unless the box already holds the same text.
  if (synced !== current) {
    setSynced(current);
    if (current !== sent && normalize(value) !== current) setValue(current);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

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
      className="relative col-span-3 md:col-span-1"
      onSubmit={(e) => {
        e.preventDefault();
        apply(value, false);
      }}
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        aria-label="Search problems by title"
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
        className="pl-9"
      />
    </form>
  );
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: FilterOption[];
  onChange: (value: string | undefined) => void;
}) {
  const labelId = useId();
  const valueId = useId();
  const items = [{ value: ALL, label: allLabel }, ...options];
  return (
    <Select
      items={items}
      value={value ?? null}
      onValueChange={(v) => onChange(v === null || v === ALL ? undefined : String(v))}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <SelectTrigger aria-labelledby={`${labelId} ${valueId}`} className="w-full min-w-0">
        <SelectValue id={valueId} placeholder={label} className="truncate" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
