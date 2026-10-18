// Rating-mode panels of the lobby (docs/specs/rooms-v2.md §2.3, §6.3, §12):
// the host's expectation box ("Expected: about 2.2 of 4 solved per person
// (54%; target Balanced 55%)", the room's rating range, provisional names)
// and the "How are problems picked by rating?" disclosure for everyone (the
// computed targets only for the host: they would narrow problems down).
import { InfoIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { expectationCopy, ratingExplainer } from "@/lib/rooms/lobby-rating";
import type { LobbyExpectationView, LobbyView } from "@/lib/rooms/session-view";
import type { Challenge } from "@/lib/rooms/types";

export function LobbyExpectationPanel({
  expected,
  problemCount,
  challenge,
}: {
  expected: LobbyExpectationView;
  problemCount: number;
  challenge: Challenge;
}) {
  const copy = expectationCopy(expected, problemCount, challenge);
  return (
    <div className="rounded-lg border bg-surface-sunken px-4 py-3 text-sm" data-testid="lobby-expected">
      <p className="text-foreground">
        <span className="font-semibold">{copy.headline}</span> {copy.detail}.
      </p>
      {copy.range && <p className="mt-1 text-foreground-secondary">{copy.range}</p>}
      {copy.provisional && <p className="mt-1 text-foreground-secondary">{copy.provisional}</p>}
      {copy.coarse && <p className="mt-1 text-foreground-secondary">{copy.coarse}</p>}
    </div>
  );
}

export function RatingExplainerCard({ lobby }: { lobby: Pick<LobbyView, "problemCount" | "settings" | "expected"> }) {
  const e = ratingExplainer(lobby);
  return (
    <Card size="sm" data-testid="rating-explainer">
      <CardContent>
        <details className="group text-sm">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-medium text-link">
            <InfoIcon aria-hidden className="size-4" />
            How are problems picked by rating?
          </summary>
          <div className="mt-3 flex flex-col gap-2 text-foreground-secondary">
            <p>{e.example}</p>
            <p className="rounded-md border bg-surface-sunken px-3 py-2 font-mono text-[0.8125rem] break-words text-foreground">
              {e.formula}
            </p>
            <p>{e.ladder}</p>
            {e.targets && <p className="font-medium text-foreground">{e.targets}</p>}
            <p>{e.how}</p>
            <p>{e.privacy}</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
