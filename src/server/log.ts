// Structured server-side error logging (one JSON line per event). Messages are
// scrubbed of URLs with credentials (`scheme://user:password@host`) and of
// `password=` pairs so a connection string never reaches the logs.

export type SafeError = { name: string; code?: string; message: string };

const URL_WITH_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]*@[^\s]*/gi;
const PASSWORD_PAIR = /\bpassword\s*=\s*\S+/gi;

export function redact(text: string): string {
  return text
    .replace(URL_WITH_CREDENTIALS, "[redacted-url]")
    .replace(PASSWORD_PAIR, "password=[redacted]");
}

/** Name, error code and redacted message of an error (also of its `cause`, as Drizzle wraps pg errors). */
export function safeError(error: unknown): SafeError {
  const e = error as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const cause = e?.cause as { code?: unknown; message?: unknown } | undefined;
  const code = typeof cause?.code === "string" ? cause.code : typeof e?.code === "string" ? e.code : undefined;
  // Drizzle's own message embeds the failed SQL and its parameters; the cause
  // carries the real reason, so a wrapped error is reported by its cause only.
  const source = cause && typeof cause === "object" ? cause : e;
  const raw = typeof source?.message === "string" ? source.message : String(error);
  const name =
    typeof (source as { name?: unknown })?.name === "string"
      ? (source as { name: string }).name
      : "Error";
  return {
    name,
    ...(code ? { code } : {}),
    // pg reports a refused dual-stack connect as an AggregateError with an empty message.
    message: redact(raw) || code || name,
  };
}

export function logError(event: string, error: unknown, extra: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({ level: "error", event, ...extra, error: safeError(error), time: new Date().toISOString() }),
  );
}
