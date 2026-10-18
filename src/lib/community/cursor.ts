// Keyset cursors (docs/specs/community.md §C.5): base64url(JSON {k, id}),
// validated with Zod on the way in. Best: k = [rank_best, created_at];
// New and replies: k = [created_at]. Opaque to clients.
import { z } from "zod";

const cursorSchema = z
  .object({
    k: z.array(z.union([z.number().finite(), z.string().max(40)])).min(1).max(3),
    id: z.uuid(),
  })
  .strict();

export type Cursor = z.infer<typeof cursorSchema>;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

/** The cursor, or null for anything malformed (callers answer 400). */
export function decodeCursor(value: string): Cursor | null {
  const text = fromBase64Url(value);
  if (text === null) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
