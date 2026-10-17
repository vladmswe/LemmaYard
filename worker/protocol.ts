// Sandbox wire protocol (PLAN.md section 5): the stdin payload sent to the
// harness and the frames it writes back. Pure, no Docker.
import { z } from "zod";

import type { Signature } from "@/lib/problems/schema";

import type { Language } from "./types";

/** Exactly what enters the container. There is deliberately no `expected`. */
export type SandboxPayload = {
  language: Language;
  code: string;
  signature: Signature;
  tests: { input: Record<string, unknown> }[];
  /** Effective per-test limit (problem limit × language multiplier). */
  timeLimitMs: number;
  /** Harness stops after the first error/timeout (Submit). */
  stopOnError: boolean;
  nonce: string;
};

const common = {
  stdout: z.string(),
  memoryKb: z.number().int().nonnegative(),
};

export const frameSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("compile_error"), error: z.string(), ...common }),
  z.object({
    kind: z.literal("fatal"),
    status: z.enum(["error", "timeout"]),
    error: z.string(),
    ...common,
  }),
  z.object({
    kind: z.literal("test"),
    index: z.number().int().nonnegative(),
    status: z.enum(["ok", "error", "timeout"]),
    actual: z.unknown().optional(),
    error: z.string().optional(),
    memory: z.boolean().optional(),
    timeMs: z.number().nonnegative(),
    ...common,
  }),
  z.object({ kind: z.literal("done"), ...common }),
]);

export type Frame = z.infer<typeof frameSchema>;
export type TestFrame = Extract<Frame, { kind: "test" }>;

export function framePrefix(nonce: string): string {
  return `@@${nonce}@@`;
}

/**
 * Splits a byte stream into lines and returns frames carrying the right nonce.
 * Lines without the prefix (user writes to fd 1, forged frames) are ignored;
 * a line with the right prefix that is not a valid frame makes the run bad.
 */
export class FrameParser {
  readonly frames: Frame[] = [];
  bad = false;
  private pending: Buffer[] = [];
  private readonly prefix: Buffer;

  constructor(nonce: string) {
    this.prefix = Buffer.from(framePrefix(nonce));
  }

  push(chunk: Buffer): Frame[] {
    const out: Frame[] = [];
    let start = 0;
    for (let i = chunk.indexOf(10); i >= 0; i = chunk.indexOf(10, start)) {
      this.pending.push(chunk.subarray(start, i));
      const line = Buffer.concat(this.pending);
      this.pending = [];
      start = i + 1;
      const frame = this.parseLine(line);
      if (frame) out.push(frame);
    }
    if (start < chunk.length) this.pending.push(chunk.subarray(start));
    this.frames.push(...out);
    return out;
  }

  private parseLine(line: Buffer): Frame | null {
    if (line.length < this.prefix.length || !line.subarray(0, this.prefix.length).equals(this.prefix)) {
      return null;
    }
    try {
      const parsed = frameSchema.safeParse(
        JSON.parse(line.subarray(this.prefix.length).toString("utf8")),
      );
      if (parsed.success) return parsed.data;
    } catch {
      // fall through
    }
    this.bad = true;
    return null;
  }
}
