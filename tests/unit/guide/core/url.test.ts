import { describe, expect, it } from "vitest";

import {
  getParam,
  parseStepParam,
  readPlayerParams,
  writePlayerParams,
} from "@/lib/guide/player/url";

describe("player URL params", () => {
  it("reads step and input of one player", () => {
    const q = `?step.scan=5&input.scan=${encodeURIComponent("1, 2; 3")}&step.other=2`;
    expect(readPlayerParams(q, "scan")).toEqual({ step: "5", input: "1, 2; 3" });
    expect(readPlayerParams(q, "other")).toEqual({ step: "2", input: null });
    expect(readPlayerParams("", "scan")).toEqual({ step: null, input: null });
  });

  it("decodes '+' as a space and survives malformed escapes", () => {
    expect(getParam("?input.a=1,+2", "input.a")).toBe("1, 2");
    expect(getParam("?input.a=%E0%A4%A", "input.a")).toBeNull();
  });

  it("parseStepParam accepts 1..frameCount only", () => {
    expect(parseStepParam("1", 5)).toBe(0);
    expect(parseStepParam("5", 5)).toBe(4);
    for (const bad of ["0", "6", "-1", "2.5", "abc", "", "1e2", "99999"]) {
      expect(parseStepParam(bad, 5)).toBeNull();
    }
  });

  it("writes this player's keys and keeps other parameters in order", () => {
    const q = "?tab=code&step.scan=2&step.other=3";
    expect(writePlayerParams(q, "scan", { step: 4, input: null })).toBe("?tab=code&step.other=3&step.scan=4");
    expect(writePlayerParams("", "scan", { step: 1, input: "7, 3; 9" })).toBe(
      `?step.scan=1&input.scan=${encodeURIComponent("7, 3; 9")}`,
    );
  });

  it("removes the input key when the input is back to the default", () => {
    const q = "?step.scan=2&input.scan=1%2C2";
    expect(writePlayerParams(q, "scan", { step: 2, input: null })).toBe("?step.scan=2");
  });

  it("round-trips arbitrary input text", () => {
    const text = "a&b=c; 1, 2 ?#%";
    const q = writePlayerParams("?x=1", "p", { step: 3, input: text });
    expect(readPlayerParams(q, "p")).toEqual({ step: "3", input: text });
    expect(getParam(q, "x")).toBe("1");
  });
});
