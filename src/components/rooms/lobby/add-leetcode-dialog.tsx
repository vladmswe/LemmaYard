"use client";

// "Add LeetCode problem" in the lobby (docs/specs/rooms-external-problems.md
// §4): pick an entry of the room's LeetCode list, or paste a link (owner:
// optionally saved to the list). The server fills the first empty LeetCode
// slot or appends one; nothing is fetched from leetcode.com.
import { PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  emptyExternalForm,
  validateExternalForm,
  type BankEntry,
  type ExternalForm,
  type SessionExternalBody,
} from "@/lib/rooms/external";

import { DIFFICULTY_ESTIMATED_HELP, LEETCODE_ATTRIBUTION, ratingSourceHelp, TAGS_ESTIMATED_HELP } from "@/lib/leetcode/labels";
import type { LeetCodeSearchHit } from "@/server/rooms/leetcode-search";

import { ExternalProblemFields } from "../external/external-problem-fields";
import { EstimatedTag, LeetCodeLink } from "../external/leetcode-bits";
import { NativeSelect } from "../settings/native-select";
import { sessionApi } from "../live/session-api";

export function AddLeetCodeDialog({
  roomId,
  sessionId,
  catalogSize,
  tagName,
  pending,
  canSaveToBank,
  inSession,
  onClose,
  onAdd,
}: {
  roomId: string;
  sessionId: string;
  /** Size of the LeetCode catalog; null when auto-pick and the catalog search are unavailable. */
  catalogSize: number | null;
  tagName: (slug: string) => string;
  pending: boolean;
  /** The room owner may save a pasted link to the room's list. */
  canSaveToBank: boolean;
  /** LeetCode slugs already in the session. */
  inSession: ReadonlySet<string>;
  onClose: () => void;
  /** Sends the body; resolves true when the slot was added (the dialog closes). */
  onAdd: (body: SessionExternalBody) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const saveId = useId();
  const [bank, setBank] = useState<BankEntry[] | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [tab, setTab] = useState<"catalog" | "list" | "link">(catalogSize !== null ? "catalog" : "list");
  const [form, setForm] = useState<ExternalForm>(emptyExternalForm());
  const [save, setSave] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void sessionApi.bank(roomId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setBank(res.data.problems);
        if (res.data.problems.length === 0) setTab((t) => (t === "list" ? "link" : t));
      } else {
        setBankError(res.error);
        setTab((t) => (t === "list" ? "link" : t));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function addFromBank(id: string) {
    const res = await onAdd({ action: "add", bankId: id });
    if (!res.ok) setBankError(res.error);
  }

  async function submitLink(e: FormEvent) {
    e.preventDefault();
    const v = validateExternalForm(form);
    if (!v.ok) {
      setErrors(v.fieldErrors);
      return;
    }
    setErrors({});
    const res = await onAdd({ action: "add", ...v.input, ...(canSaveToBank && save ? { saveToBank: true } : {}) });
    if (!res.ok) setErrors({ form: res.error });
  }

  const available = bank?.filter((b) => !inSession.has(b.slug)) ?? null;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" data-testid="add-leetcode-dialog">
        <DialogHeader>
          <DialogTitle>Add a LeetCode problem</DialogTitle>
          <DialogDescription>
            It joins the session as a link to leetcode.com. Participants mark it solved themselves; it never changes
            ratings. Others see its title when the session starts.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "catalog" | "list" | "link")} className="gap-4">
          <TabsList aria-label="Where from" className="h-auto w-full flex-wrap">
            {catalogSize !== null && (
              <TabsTrigger value="catalog" className="h-10 flex-1" data-testid="tab-leetcode-catalog">
                From the LeetCode list
              </TabsTrigger>
            )}
            <TabsTrigger value="list" className="h-10 flex-1">
              From the room list
            </TabsTrigger>
            <TabsTrigger value="link" className="h-10 flex-1">
              Paste a link
            </TabsTrigger>
          </TabsList>
          {catalogSize !== null && (
            <TabsContent value="catalog" className="flex flex-col gap-3">
              <CatalogSearch
                roomId={roomId}
                sessionId={sessionId}
                size={catalogSize}
                pending={pending}
                tagName={tagName}
                onAdd={(slug) => onAdd({ action: "add", catalogSlug: slug })}
              />
            </TabsContent>
          )}
          <TabsContent value="list" className="flex flex-col gap-3">
            {bankError && <FieldError>{bankError}</FieldError>}
            {available === null ? (
              !bankError && <p className="text-sm text-muted-foreground">Loading the room&apos;s list…</p>
            ) : available.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground" data-testid="bank-none">
                {bank && bank.length > 0
                  ? "Every problem of the room's list is already in this session."
                  : "The room's LeetCode list is empty. Paste a link instead, or ask the owner to add problems in Settings."}
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border" aria-label="The room's LeetCode problems">
                {available.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`pick-${b.slug}`}>
                    <span className="flex min-w-0 flex-col gap-1">
                      <LeetCodeLink slug={b.slug} className="truncate font-medium">
                        {b.title}
                      </LeetCodeLink>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {b.difficulty && <DifficultyBadge difficulty={b.difficulty} variant="text" className="text-xs" />}
                        {b.rating !== null && <span className="font-mono">rating {b.rating}</span>}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => addFromBank(b.id)}
                      data-testid={`add-bank-${b.slug}`}
                    >
                      <PlusIcon aria-hidden />
                      Add<span className="sr-only"> {b.title}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="link">
            <form onSubmit={submitLink} noValidate className="flex flex-col gap-5" data-testid="add-leetcode-link">
              <ExternalProblemFields
                form={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                errors={errors}
                disabled={pending}
              />
              {canSaveToBank && (
                <label htmlFor={saveId} className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    id={saveId}
                    checked={save}
                    onCheckedChange={(v) => setSave(v === true)}
                    disabled={pending}
                    data-testid="save-to-bank"
                  />
                  <span>Also save it to the room&apos;s LeetCode list</span>
                </label>
              )}
              {errors.form && <FieldError>{errors.form}</FieldError>}
              <DialogFooter>
                <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending} data-testid="add-leetcode-submit">
                  Add to the session
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** "From the LeetCode list": search the committed catalog (number or title, difficulty, rating range). */
function CatalogSearch({
  roomId,
  sessionId,
  size,
  pending,
  tagName,
  onAdd,
}: {
  roomId: string;
  sessionId: string;
  size: number;
  pending: boolean;
  tagName: (slug: string) => string;
  onAdd: (slug: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [hits, setHits] = useState<LeetCodeSearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(params: Record<string, string>) {
    setSearching(true);
    const res = await sessionApi.leetcodeSearch(roomId, sessionId, params);
    setSearching(false);
    if (res.ok) {
      setHits(res.data.problems);
      setError(null);
    } else {
      setError(res.error);
    }
  }

  // The first page (lowest numbers) when the tab opens.
  useEffect(() => {
    let cancelled = false;
    void sessionApi.leetcodeSearch(roomId, sessionId, {}).then((res) => {
      if (cancelled) return;
      if (res.ok) setHits(res.data.problems);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, sessionId]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (q.trim()) params.q = q.trim();
    if (difficulty) params.difficulty = difficulty;
    if (min.trim()) params.min = min.trim();
    if (max.trim()) params.max = max.trim();
    void search(params);
  }

  async function add(slug: string) {
    const res = await onAdd(slug);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="leetcode-catalog-search">
      <p className="text-sm text-muted-foreground">
        {size.toLocaleString("en-US")} LeetCode contest problems. Ratings: {LEETCODE_ATTRIBUTION}; difficulty is estimated from
        the rating.
      </p>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto]" role="search" aria-label="LeetCode problems">
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <Label htmlFor={`${id}-q`}>Number or title</Label>
          <Input id={`${id}-q`} value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 1235 or stairs" data-testid="leetcode-search-q" />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <Label htmlFor={`${id}-d`}>Difficulty</Label>
          <NativeSelect id={`${id}-d`} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="sm:w-32">
            <option value="">Any</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-min`}>Rating from</Label>
          <Input id={`${id}-min`} inputMode="numeric" value={min} maxLength={4} onChange={(e) => setMin(e.target.value)} placeholder="1200" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-max`}>to</Label>
          <Input id={`${id}-max`} inputMode="numeric" value={max} maxLength={4} onChange={(e) => setMax(e.target.value)} placeholder="1800" />
        </div>
        <Button type="submit" variant="secondary" loading={searching} className="col-span-2 sm:col-span-1 sm:col-start-2 sm:self-end" data-testid="leetcode-search-submit">
          <SearchIcon aria-hidden />
          Search
        </Button>
      </form>
      {error && <FieldError>{error}</FieldError>}
      <p className="sr-only" aria-live="polite">
        {hits === null ? "" : `${hits.length} result${hits.length === 1 ? "" : "s"}`}
      </p>
      {hits !== null && hits.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">No LeetCode problem matches. Try other filters.</p>
      )}
      {hits !== null && hits.length > 0 && (
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border" aria-label="Matching LeetCode problems">
          {hits.map((h) => (
            <li key={h.slug} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`catalog-hit-${h.slug}`}>
              <span className="flex min-w-0 flex-col gap-1">
                <LeetCodeLink slug={h.slug} className="font-medium break-words">
                  {h.title}
                </LeetCodeLink>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">#{h.n}</span>
                  {h.difficulty && <DifficultyBadge difficulty={h.difficulty} variant="text" className="text-xs" />}
                  {h.provenance.difficultyEstimated && h.difficulty && <EstimatedTag help={DIFFICULTY_ESTIMATED_HELP} />}
                  {h.rating !== null && (
                    <span className="font-mono" title={h.provenance.ratingSource ? ratingSourceHelp(h.provenance.ratingSource) : undefined}>
                      rating {h.rating}
                    </span>
                  )}
                  {h.tags.length > 0 && <span>{h.tags.map(tagName).join(", ")}</span>}
                  {h.tags.length > 0 && h.provenance.tagsEstimated && <EstimatedTag help={TAGS_ESTIMATED_HELP} />}
                </span>
              </span>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => add(h.slug)} data-testid={`add-catalog-${h.slug}`}>
                <PlusIcon aria-hidden />
                Add<span className="sr-only"> {h.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
