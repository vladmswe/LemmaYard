// Comment body rules (docs/specs/community.md §B.5, AC-C-CM-2): length, no
// control characters, fenced code block caps, @mentions, and the normalized
// form whose sha256 detects duplicates (§B.11). Pure and client-safe, so the
// composer shows the same errors the server returns.
import { COMMUNITY_LIMITS } from "./types";

/** C0 controls except tab, line feed and carriage return; plus DEL. */
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function hasForbiddenControl(text: string): boolean {
  return FORBIDDEN_CONTROL.test(text);
}

/** Lowercase, collapsed whitespace, trimmed: the input of `body_hash`. */
export function normalizeForHash(body: string): string {
  return body.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

export type CodeBlockStats = { count: number; maxLines: number };

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Fenced code blocks (``` or ~~~, CommonMark rules: a closing fence uses the
 * same character and is at least as long; an unclosed fence runs to the end).
 */
export function codeBlockStats(body: string): CodeBlockStats {
  const lines = body.split(/\r\n|\r|\n/);
  let count = 0;
  let maxLines = 0;
  let open: { char: string; length: number; lines: number } | null = null;
  for (const line of lines) {
    if (open) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === open.char && close[1].length >= open.length) {
        maxLines = Math.max(maxLines, open.lines);
        open = null;
      } else {
        open.lines += 1;
      }
      continue;
    }
    const fence = FENCE_OPEN.exec(line);
    // A backtick fence's info string may not contain backticks.
    if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
      count += 1;
      open = { char: fence[1][0], length: fence[1].length, lines: 0 };
    }
  }
  if (open) maxLines = Math.max(maxLines, open.lines);
  return { count, maxLines };
}

const MENTION = /(?<![\w@./])@([a-z0-9_]{3,20})(?![\w])/gi;

/** Distinct @usernames (lowercase) in order of first appearance. */
export function extractMentions(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(MENTION)) seen.add(m[1].toLowerCase());
  return [...seen];
}

/**
 * The first rule a body breaks, as a user-facing message, or null when it is
 * acceptable. Runs on the trimmed body.
 */
export function bodyProblem(raw: string): string | null {
  if (hasForbiddenControl(raw)) return "The text contains control characters.";
  const body = raw.trim();
  if (body.length === 0) return "Write something first.";
  if (body.length > COMMUNITY_LIMITS.bodyMaxChars) {
    return `At most ${COMMUNITY_LIMITS.bodyMaxChars.toLocaleString("en-US")} characters.`;
  }
  const blocks = codeBlockStats(body);
  if (blocks.count > COMMUNITY_LIMITS.codeBlocksMax) {
    return `At most ${COMMUNITY_LIMITS.codeBlocksMax} code blocks per comment.`;
  }
  if (blocks.maxLines > COMMUNITY_LIMITS.codeBlockLinesMax) {
    return `A code block can have at most ${COMMUNITY_LIMITS.codeBlockLinesMax} lines.`;
  }
  if (extractMentions(body).length > COMMUNITY_LIMITS.mentionsMax) {
    return `At most ${COMMUNITY_LIMITS.mentionsMax} @mentions per comment.`;
  }
  return null;
}
