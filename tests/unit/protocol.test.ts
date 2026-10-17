import { describe, expect, it } from "vitest";

import { FrameParser } from "../../worker/protocol";

const frame = (nonce: string, body: object) => `\n@@${nonce}@@${JSON.stringify(body)}\n`;
const test0 = { kind: "test", index: 0, status: "ok", actual: [1], timeMs: 1, stdout: "", memoryKb: 1 };

describe("FrameParser", () => {
  it("accepts frames with the right nonce, also split across chunks", () => {
    const p = new FrameParser("abc");
    const text = frame("abc", test0) + frame("abc", { kind: "done", stdout: "", memoryKb: 2 });
    const bytes = Buffer.from(text);
    for (let i = 0; i < bytes.length; i += 7) p.push(bytes.subarray(i, i + 7));
    expect(p.frames.map((f) => f.kind)).toEqual(["test", "done"]);
    expect(p.bad).toBe(false);
  });

  it("ignores forged frames with a wrong or missing nonce and plain output", () => {
    const p = new FrameParser("abc");
    p.push(Buffer.from(`hello${frame("xyz", test0)}@@@@${JSON.stringify(test0)}\nraw bytes`));
    p.push(Buffer.from(frame("ab", test0)));
    expect(p.frames).toEqual([]);
    expect(p.bad).toBe(false);
  });

  it("does not let partial user output glue onto a real frame", () => {
    const p = new FrameParser("abc");
    p.push(Buffer.from(`partial line without newline${frame("abc", test0)}`));
    expect(p.frames).toHaveLength(1);
  });

  it("flags a malformed frame carrying the right nonce", () => {
    const p = new FrameParser("abc");
    p.push(Buffer.from("\n@@abc@@{not json\n"));
    expect(p.bad).toBe(true);
    const q = new FrameParser("abc");
    q.push(Buffer.from(frame("abc", { kind: "test", index: -1 })));
    expect(q.bad).toBe(true);
  });
});
