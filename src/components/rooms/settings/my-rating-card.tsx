"use client";

// Settings → Your starting rating (Rooms v2 §6.4, §12 Profile copy; owner
// decision D2): the optional self-reported LeetCode contest rating, saved
// through POST /api/me/rating. It only seeds a member's first rating when
// they join a room and is never shown to anyone else. The site has no
// account settings page, so it lives in every room's Settings tab (the
// value is the same for all rooms).
import { useEffect, useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selfRatingResultCopy } from "@/lib/rooms/self-rating-copy";
import { SELF_REPORTED_MAX, SELF_REPORTED_MIN, selfRatingBodySchema } from "@/lib/rooms/rating-schemas";

import { postJson } from "../room-api";

type MyRating = { leetcodeRating: number | null; reseeded?: number; kept?: number };

export function MyRatingCard() {
  const id = useId();
  const [loaded, setLoaded] = useState<number | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/rating", { cache: "no-store", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<MyRating>) : null))
      .then((data) => {
        if (!alive) return;
        const lc = data?.leetcodeRating ?? null;
        setLoaded(lc);
        setValue(lc === null ? "" : String(lc));
      })
      .catch(() => alive && setLoaded(null));
    return () => {
      alive = false;
    };
  }, []);

  async function save(next: number | null) {
    const parsed = selfRatingBodySchema.safeParse({ leetcodeRating: next });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a number");
      return;
    }
    setError(null);
    setResult(null);
    setPending(true);
    const res = await postJson<MyRating>("/api/me/rating", parsed.data);
    setPending(false);
    if (!res.ok) {
      setError(res.fieldErrors?.leetcodeRating ?? res.error);
      return;
    }
    setLoaded(res.data.leetcodeRating);
    setValue(res.data.leetcodeRating === null ? "" : String(res.data.leetcodeRating));
    setResult(selfRatingResultCopy(res.data.leetcodeRating, res.data.reseeded ?? 0, res.data.kept ?? 0));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === "") return save(null);
    if (!/^\d+$/.test(trimmed)) {
      setError(`Use a whole number, ${SELF_REPORTED_MIN}–${SELF_REPORTED_MAX}`);
      return;
    }
    return save(Number(trimmed));
  }

  const current = loaded === undefined ? null : loaded;
  const dirty = loaded !== undefined && value.trim() !== (current === null ? "" : String(current));
  return (
    <Card data-testid="my-rating-card">
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Your starting rating</h2>
        <CardDescription>
          Used only as your starting rating when you join a room. Never shown to anyone else. We don&apos;t read anything
          from LeetCode.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <Field>
            <Label htmlFor={`${id}-lc`}>LeetCode contest rating (optional)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={`${id}-lc`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 1650"
                value={value}
                disabled={loaded === undefined || pending}
                onChange={(e) => setValue(e.target.value)}
                className="w-40"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-e` : `${id}-h`}
                data-testid="lc-rating-input"
              />
              <Button type="submit" variant="secondary" loading={pending} disabled={!dirty} data-testid="lc-rating-save">
                Save
              </Button>
              {current !== null && (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => save(null)}>
                  Clear
                </Button>
              )}
            </div>
            {error ? (
              <FieldError id={`${id}-e`}>{error}</FieldError>
            ) : (
              <FieldHelp id={`${id}-h`}>
                {SELF_REPORTED_MIN}–{SELF_REPORTED_MAX}. It counts only in rooms where you have no rated sessions yet;
                after that your rating comes from the sessions.
              </FieldHelp>
            )}
          </Field>
          <p role="status" className="text-sm text-foreground-secondary" data-testid="lc-rating-result">
            {result ?? ""}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
