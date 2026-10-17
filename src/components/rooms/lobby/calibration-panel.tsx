// Calibration panel (docs/specs/rooms.md §2.2, §2.3 copy): the suggested mix,
// the numbers it is based on, and how the rates are computed in plain words.
// Host/owner only (the lobby view carries `calibration` only for them).
import { InfoIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { calibrationCopy, unusedLine } from "@/lib/rooms/lobby-copy";
import { mixLabel, type LobbyView } from "@/lib/rooms/session-view";

export function CalibrationPanel({ lobby }: { lobby: LobbyView }) {
  const cal = lobby.calibration;
  if (!cal) return null;
  const copy = calibrationCopy(cal, lobby.problemCount, lobby.settings.challenge);
  const manual = lobby.settings.mixMode === "manual";
  const actual = mixLabel(lobby.actualMix);

  return (
    <Card size="sm" data-testid="calibration-panel">
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-[1.0625rem]/6 font-semibold">Difficulty mix</h2>
        <div className="flex flex-col gap-1">
          {copy.suggested && <p className="font-semibold text-foreground">{copy.suggested}</p>}
          <p className="text-sm text-foreground-secondary">{copy.basis}</p>
          {copy.expected && <p className="text-sm text-foreground-secondary">{copy.expected}</p>}
          {(manual || (cal.suggested && mixLabel(cal.suggested) !== actual)) && (
            <p className="text-sm text-foreground-secondary">
              {manual ? "Custom mix in use. " : ""}Actual: {actual}
            </p>
          )}
        </div>

        <table className="w-full max-w-sm text-sm">
          <caption className="sr-only">Solve rates by difficulty</caption>
          <thead>
            <tr className="text-left text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              <th scope="col" className="py-1 pr-3 font-semibold">
                Difficulty
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-semibold">
                Solved
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Rate used
              </th>
            </tr>
          </thead>
          <tbody>
            {copy.rates.map((r) => (
              <tr key={r.difficulty} className="border-t">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                  {r.label}
                </th>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {r.solved} of {r.pairs}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{r.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <details className="group text-sm">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-medium text-link">
            <InfoIcon aria-hidden className="size-4" />
            How is this calculated?
          </summary>
          <p className="mt-2 text-foreground-secondary">{copy.explainer}</p>
        </details>

        {lobby.pool && <p className="text-sm text-muted-foreground">{unusedLine(lobby.pool.unused)}</p>}
      </CardContent>
    </Card>
  );
}
