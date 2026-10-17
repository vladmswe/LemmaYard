// Deep links of guide players: `step.<playerId>` (1-based) and
// `input.<playerId>` (encodeURIComponent(format(input))) in the query string.
// Pure string functions; the player calls window.history.replaceState with the result.

export function stepKey(playerId: string): string {
  return `step.${playerId}`;
}

export function inputKey(playerId: string): string {
  return `input.${playerId}`;
}

function splitSearch(search: string): string[] {
  const s = search.startsWith("?") ? search.slice(1) : search;
  return s.split("&").filter((p) => p.length > 0);
}

function decode(v: string): string | null {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/** Raw (decoded) value of `key`, or null when absent or not decodable. */
export function getParam(search: string, key: string): string | null {
  for (const pair of splitSearch(search)) {
    const eq = pair.indexOf("=");
    const k = decode(eq === -1 ? pair : pair.slice(0, eq));
    if (k === key) return eq === -1 ? "" : decode(pair.slice(eq + 1));
  }
  return null;
}

export interface PlayerUrlParams {
  /** null = no `step.<id>` key; otherwise the raw value (validated by parseStepParam). */
  readonly step: string | null;
  /** null = no `input.<id>` key; otherwise the decoded raw input text. */
  readonly input: string | null;
}

export function readPlayerParams(search: string, playerId: string): PlayerUrlParams {
  return { step: getParam(search, stepKey(playerId)), input: getParam(search, inputKey(playerId)) };
}

/** 1-based step text → 0-based index, or null when not an integer in 1..frameCount. */
export function parseStepParam(raw: string, frameCount: number): number | null {
  if (!/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  if (n < 1 || n > frameCount) return null;
  return n - 1;
}

/**
 * Returns `search` (with leading "?" when non-empty) with this player's keys
 * replaced. `input: null` removes the input key (default input). Other
 * parameters, including other players' keys, keep their order and encoding.
 */
export function writePlayerParams(
  search: string,
  playerId: string,
  next: { step: number; input: string | null },
): string {
  const sKey = stepKey(playerId);
  const iKey = inputKey(playerId);
  const kept = splitSearch(search).filter((pair) => {
    const eq = pair.indexOf("=");
    const k = decode(eq === -1 ? pair : pair.slice(0, eq));
    return k !== sKey && k !== iKey;
  });
  kept.push(`${encodeURIComponent(sKey)}=${encodeURIComponent(String(next.step))}`);
  if (next.input !== null) {
    kept.push(`${encodeURIComponent(iKey)}=${encodeURIComponent(next.input)}`);
  }
  return kept.length > 0 ? `?${kept.join("&")}` : "";
}
