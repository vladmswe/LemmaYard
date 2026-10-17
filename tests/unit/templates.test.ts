import { describe, expect, it } from "vitest";

import type { SignatureLike } from "@/lib/types";
import { generateTemplate, type TemplateLanguage } from "@/lib/templates";

// Together these cover every type (int, float, bool, string, T[], T[][]) as
// parameters and as return types, in both languages.
const cases: Record<string, SignatureLike> = {
  scalars: {
    name: "mixScalars",
    params: [
      { name: "count", type: "int" },
      { name: "ratio", type: "float" },
      { name: "flag", type: "bool" },
      { name: "label", type: "string" },
    ],
    returns: "float",
  },
  arrays: {
    name: "mixArrays",
    params: [
      { name: "nums", type: "int[]" },
      { name: "weights", type: "float[]" },
      { name: "flags", type: "bool[]" },
      { name: "words", type: "string[]" },
    ],
    returns: "string[]",
  },
  matrices: {
    name: "mixMatrices",
    params: [
      { name: "grid", type: "int[][]" },
      { name: "points", type: "float[][]" },
      { name: "mask", type: "bool[][]" },
      { name: "board", type: "string[][]" },
    ],
    returns: "int[][]",
  },
  "return-int": { name: "countIt", params: [{ name: "s", type: "string" }], returns: "int" },
  "return-bool": { name: "checkIt", params: [{ name: "x", type: "int" }], returns: "bool" },
  "return-string": { name: "nameIt", params: [{ name: "x", type: "int" }], returns: "string" },
  "return-float-array": {
    name: "scaleIt",
    params: [{ name: "values", type: "float[]" }],
    returns: "float[]",
  },
  "return-bool-matrix": {
    name: "maskIt",
    params: [{ name: "grid", type: "int[][]" }],
    returns: "bool[][]",
  },
};

const extensions: Record<TemplateLanguage, string> = { python: "py", javascript: "js" };

describe("generateTemplate (golden files in tests/unit/__golden__)", () => {
  for (const [caseName, signature] of Object.entries(cases)) {
    for (const language of ["python", "javascript"] as const) {
      it(`${caseName} / ${language}`, async () => {
        await expect(generateTemplate(signature, language)).toMatchFileSnapshot(
          `./__golden__/${caseName}.${extensions[language]}`,
        );
      });
    }
  }

  it("rejects unknown types", () => {
    expect(() =>
      generateTemplate({ name: "f", params: [{ name: "x", type: "long" }], returns: "int" }, "python"),
    ).toThrow(/unknown type "long"/);
  });
});
