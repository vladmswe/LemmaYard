// "@line" markers in lesson code samples (PLAN-GUIDE 2.6). A marker sits at
// the end of a code line, `# @line heap.siftUp.compare` in Python and
// `// @line heap.siftUp.compare` in JavaScript, with one or more line ids
// separated by spaces. The marker and the whitespace before it are stripped
// from the displayed source; indentation and blank lines stay.
import type { CodeLanguage, LineId } from "../contracts";

export const LINE_ID_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

const MARKER = {
  python: /^(.*?)\s*#\s?@line(?=\s|$)(.*)$/,
  javascript: /^(.*?)\s*\/\/\s?@line(?=\s|$)(.*)$/,
} as const satisfies Record<CodeLanguage, RegExp>;

export interface MarkedSource {
  /** File content with every marker stripped (one trailing newline dropped). */
  readonly source: string;
  /** Line id -> 1-based display lines of `source`, ascending. */
  readonly lineMap: Readonly<Record<LineId, readonly number[]>>;
  /** Display line (1-based) -> its ids, for lines that carry markers. */
  readonly idsByLine: ReadonlyMap<number, readonly LineId[]>;
}

export class MarkerError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = "MarkerError";
  }
}

export function parseMarkedSource(text: string, language: CodeLanguage, file = "<source>"): MarkedSource {
  const raw = text.replace(/\r\n/g, "\n");
  const lines = (raw.endsWith("\n") ? raw.slice(0, -1) : raw).split("\n");
  const lineMap: Record<LineId, number[]> = {};
  const idsByLine = new Map<number, LineId[]>();
  const out: string[] = [];

  lines.forEach((line, k) => {
    const n = k + 1;
    if (!line.includes("@line")) {
      out.push(line);
      return;
    }
    const m = MARKER[language].exec(line);
    if (!m) {
      const prefix = language === "python" ? "#" : "//";
      throw new MarkerError(file, n, `malformed marker, expected "${prefix} @line <id> [<id> ...]" at the end of the line`);
    }
    const code = m[1] as string;
    const ids = (m[2] as string).trim().split(/\s+/).filter(Boolean);
    if (ids.length === 0) throw new MarkerError(file, n, "malformed marker: no line id after @line");
    for (const id of ids) {
      if (!LINE_ID_RE.test(id)) throw new MarkerError(file, n, `malformed marker: bad line id "${id}" (expected e.g. heap.siftUp.compare)`);
    }
    if (code.trim() === "") throw new MarkerError(file, n, "a marker must follow code on the same line (marker-only line)");
    out.push(code);
    const unique = [...new Set(ids)];
    idsByLine.set(n, unique);
    for (const id of unique) (lineMap[id] ??= []).push(n);
  });

  return { source: out.join("\n"), lineMap, idsByLine };
}
