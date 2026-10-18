"use client";

import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { QedLoader } from "@/components/brand/qed-loader";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { NativeSelect } from "@/components/rooms/settings/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { externalTitleSchema, EXTERNAL_TITLE_MAX, leetCodeUrlSchema, PLAN_SEARCH_MAX } from "@/lib/plans/schemas";
import type { ProblemHit } from "@/server/plans/read";

import { getJson, sendJson } from "./plans-api";

type AddResult = { added: number; skipped: number };

/**
 * Owner's "Add problems" (mockup 06): search our catalog by title or number,
 * or paste a LeetCode problem link (only the slug is kept; nothing is fetched
 * from leetcode.com). Items go to the top list or to the chosen section.
 */
export function AddProblemsDialog({ planId, sections }: { planId: string; sections: { id: string; title: string }[] }) {
  const router = useRouter();
  const id = useId();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProblemHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [added, setAdded] = useState<Record<string, "added" | "skipped">>({});
  const [linkError, setLinkError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await getJson<{ problems: ProblemHit[] }>(`/api/plans/problem-search?q=${encodeURIComponent(q)}`);
      if (!controller.signal.aborted) {
        setHits(res.ok ? res.data.problems : []);
        setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  async function add(items: unknown[]): Promise<AddResult | null> {
    const res = await sendJson<AddResult>("POST", `/api/plans/${planId}/items`, {
      items,
      ...(sectionId ? { section: { id: sectionId } } : {}),
    });
    if (!res.ok) {
      toast.error("Could not add to the plan", { description: res.error });
      return null;
    }
    startTransition(() => router.refresh());
    return res.data;
  }

  async function addProblem(hit: ProblemHit) {
    const result = await add([{ problemSlug: hit.slug }]);
    if (result) setAdded((a) => ({ ...a, [hit.slug]: result.added > 0 ? "added" : "skipped" }));
  }

  async function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const url = leetCodeUrlSchema.safeParse(String(data.get("url") ?? ""));
    const rawTitle = String(data.get("title") ?? "").trim();
    const title = rawTitle ? externalTitleSchema.safeParse(rawTitle) : null;
    setLinkError(url.success ? null : (url.error.issues[0]?.message ?? "Paste a LeetCode problem link"));
    setTitleError(title && !title.success ? (title.error.issues[0]?.message ?? "Check the title") : null);
    if (!url.success || (title && !title.success)) return;
    setLinkPending(true);
    const result = await add([{ leetcodeUrl: String(data.get("url")), ...(title?.success ? { title: title.data } : {}) }]);
    setLinkPending(false);
    if (!result) return;
    toast.success(result.added > 0 ? "LeetCode link added" : "That problem is already in the plan");
    form.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery("");
          setHits(null);
          setAdded({});
          setLinkError(null);
          setTitleError(null);
        }
      }}
    >
      <DialogTrigger render={<Button data-testid="add-problems" />}>
        <PlusIcon aria-hidden />
        Add problems
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add problems</DialogTitle>
          <DialogDescription>From LemmaYard, or a link to a LeetCode problem. Problems already in the plan are skipped.</DialogDescription>
        </DialogHeader>
        {sections.length > 0 && (
          <Field>
            <Label htmlFor={`${id}-section`}>Add to</Label>
            <NativeSelect id={`${id}-section`} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">The top list</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Tabs defaultValue="ours">
          <TabsList>
            <TabsTrigger value="ours">On LemmaYard</TabsTrigger>
            <TabsTrigger value="leetcode">LeetCode link</TabsTrigger>
          </TabsList>
          <TabsContent value="ours" className="flex flex-col gap-3">
            <Field>
              <Label htmlFor={`${id}-q`}>Search by title or number</Label>
              <div className="relative">
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`${id}-q`}
                  type="search"
                  value={query}
                  maxLength={PLAN_SEARCH_MAX}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value.trim()) setHits(null);
                  }}
                  placeholder="Two Sum"
                  autoComplete="off"
                  className="pl-10"
                />
              </div>
            </Field>
            <div aria-live="polite" className="min-h-10">
              {searching && hits === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <QedLoader className="size-3.5" /> Searching…
                </p>
              ) : hits && hits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No problem matches “{query.trim()}”.</p>
              ) : (
                hits && (
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border" aria-label="Search results">
                    {hits.map((hit) => {
                      const state = added[hit.slug];
                      return (
                        <li key={hit.slug} className="flex items-center gap-3 px-3 py-2">
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-mono text-gutter-ink tabular-nums">{hit.number}.</span>{" "}
                            <span className="font-semibold">{hit.title}</span>
                          </span>
                          <DifficultyBadge difficulty={hit.difficulty} variant="text" className="max-sm:hidden" />
                          <Button
                            variant={state ? "ghost" : "secondary"}
                            size="sm"
                            disabled={Boolean(state)}
                            onClick={() => addProblem(hit)}
                            aria-label={state ? `${hit.title}: ${state === "added" ? "added" : "already in the plan"}` : `Add ${hit.title}`}
                          >
                            {state ? <CheckIcon aria-hidden /> : <PlusIcon aria-hidden />}
                            {state === "added" ? "Added" : state === "skipped" ? "In plan" : "Add"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </div>
          </TabsContent>
          <TabsContent value="leetcode">
            <form onSubmit={addLink} noValidate className="flex flex-col gap-4">
              <Field>
                <Label htmlFor={`${id}-url`}>LeetCode problem link</Label>
                <Input
                  id={`${id}-url`}
                  name="url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://leetcode.com/problems/two-sum/"
                  aria-invalid={linkError ? true : undefined}
                  aria-describedby={linkError ? `${id}-url-error` : `${id}-url-hint`}
                />
                {linkError ? (
                  <FieldError id={`${id}-url-error`}>{linkError}</FieldError>
                ) : (
                  <FieldHelp id={`${id}-url-hint`}>
                    Only links to leetcode.com/problems/… are accepted. We keep the link, never a copy of the problem.
                  </FieldHelp>
                )}
              </Field>
              <Field>
                <Label htmlFor={`${id}-title`}>Title (optional)</Label>
                <Input
                  id={`${id}-title`}
                  name="title"
                  autoComplete="off"
                  maxLength={EXTERNAL_TITLE_MAX * 2}
                  placeholder="From the link when empty"
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? `${id}-title-error` : undefined}
                />
                {titleError && <FieldError id={`${id}-title-error`}>{titleError}</FieldError>}
              </Field>
              <Button type="submit" loading={linkPending} className="self-end">
                Add link
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
