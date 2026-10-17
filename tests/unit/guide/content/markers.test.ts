// AC-G-1-4: @line markers.
import { describe, expect, it } from "vitest";

import { MarkerError, parseMarkedSource } from "@/lib/guide/code/markers";

describe("parseMarkedSource", () => {
  it("strips Python markers and maps ids to 1-based display lines", () => {
    const text = [
      "def push(self, v):",
      "    self.items.append(v)  # @line stack.push",
      "",
      "    return v # @line stack.ret",
      "",
    ].join("\n");
    const { source, lineMap } = parseMarkedSource(text, "python", "s.py");
    expect(source).toBe(["def push(self, v):", "    self.items.append(v)", "", "    return v"].join("\n"));
    expect(lineMap).toEqual({ "stack.push": [2], "stack.ret": [4] });
  });

  it("strips JavaScript markers and keeps indentation and blank lines", () => {
    const text = ["push(v) {", "", "  this.items.push(v); // @line stack.push", "}"].join("\n");
    const { source, lineMap } = parseMarkedSource(text, "javascript");
    expect(source.split("\n")).toEqual(["push(v) {", "", "  this.items.push(v);", "}"]);
    expect(lineMap).toEqual({ "stack.push": [3] });
  });

  it("supports several ids per line and one id on several lines", () => {
    const text = [
      "if not items:  # @line stack.check stack.pop.guard",
      "    raise IndexError()",
      "if not items:  # @line stack.check",
    ].join("\n");
    const { lineMap, idsByLine } = parseMarkedSource(text, "python");
    expect(lineMap).toEqual({ "stack.check": [1, 3], "stack.pop.guard": [1] });
    expect(idsByLine.get(1)).toEqual(["stack.check", "stack.pop.guard"]);
  });

  it("keeps comment characters inside code before the marker", () => {
    const js = parseMarkedSource('const url = "http://x"; // @line demo.url', "javascript");
    expect(js.source).toBe('const url = "http://x";');
    const py = parseMarkedSource('s = "#"  # @line demo.hash', "python");
    expect(py.source).toBe('s = "#"');
  });

  it("leaves lines without markers untouched (comments included)", () => {
    const text = "# a comment\nx = 1  # explains x";
    expect(parseMarkedSource(text, "python").source).toBe(text);
  });

  it.each([
    ["no id", "x = 1  # @line", "python"],
    ["bad id", "x = 1  # @line Stack.Push", "python"],
    ["single segment id", "x = 1  # @line push", "python"],
    ["wrong comment style", "x = 1; # @line stack.push", "javascript"],
    ["glued to the keyword", "x = 1  # @linestack.push", "python"],
  ])("throws with file and line on a malformed marker (%s)", (_name, line, lang) => {
    const text = `ok = 0\n${line}`;
    expect(() => parseMarkedSource(text, lang as "python" | "javascript", "src/x.code")).toThrow(MarkerError);
    expect(() => parseMarkedSource(text, lang as "python" | "javascript", "src/x.code")).toThrow(/^src\/x\.code:2: /);
  });

  it("throws on a marker-only line", () => {
    expect(() => parseMarkedSource("x = 1\n    # @line stack.push\n", "python", "a.py")).toThrow(
      /a\.py:2: .*marker-only/,
    );
    expect(() => parseMarkedSource("// @line stack.push", "javascript", "a.js")).toThrow(/a\.js:1: /);
  });
});
