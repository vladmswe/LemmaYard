// DB-free: validation of problem directories (AC-M1-3) against the fixtures.
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadProblems, ProblemValidationError } from "@/server/problems/importer";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

async function errorsFor(dir: string): Promise<string[]> {
  try {
    await loadProblems(path.join(FIXTURES, dir));
  } catch (error) {
    if (error instanceof ProblemValidationError) return error.errors;
    throw error;
  }
  return [];
}

describe("loadProblems", () => {
  it("loads the valid fixtures", async () => {
    const loaded = await loadProblems(path.join(FIXTURES, "problems"));
    expect(loaded.map((p) => p.meta.slug)).toEqual([
      "fixture-average",
      "fixture-evens",
      "fixture-join-words",
    ]);
    expect(loaded.find((p) => p.meta.slug === "fixture-evens")?.meta.limits).toEqual({
      timeMs: 2000,
      memoryMb: 256,
    });
  });

  // Each message names the file and the field.
  const cases: [string, RegExp[]][] = [
    ["type-mismatch", [/fixture-join-words\/tests\.json: \[2\]\.input\.upper: expected bool, got string$/]],
    [
      "input-keys",
      [
        /tests\.json: \[1\]\.input: missing parameter "words"$/,
        /tests\.json: \[1\]\.input: unknown parameter "word"$/,
      ],
    ],
    ["no-sample", [/tests\.json: at least one test must have "sample": true$/]],
    ["few-tests", [/tests\.json: at least 5 tests are required$/]],
    ["missing-solution-py", [/fixture-join-words: missing solution\.py$/]],
    ["missing-solution-js", [/fixture-join-words: missing solution\.js$/]],
    ["bad-json", [/fixture-join-words\/meta\.json: bad JSON: /]],
    ["unsafe-int", [/fixture-evens\/tests\.json:6:25: integer 9007199254740993 is outside the range ±\(2\^53−1\)$/]],
    ["invalid-identifier", [/meta\.json: signature\.name: "join-words" is not a valid identifier in both Python and JavaScript/]],
    ["reserved-word-python", [/meta\.json: signature\.params\[1\]\.name: "def" is a reserved word in Python or JavaScript$/]],
    ["reserved-word-js", [/meta\.json: signature\.name: "var" is a reserved word in Python or JavaScript$/]],
    ["float-no-epsilon", [/fixture-average\/meta\.json: compare\.epsilon: epsilon is required when compare\.mode is "float"$/]],
    [
      "duplicate-number",
      [/fixture-join-words\/meta\.json: number: duplicate number 9001 \(also in .*fixture-evens\/meta\.json\)$/],
    ],
    [
      "duplicate-slug",
      [
        /fixture-join-words-copy\/meta\.json: slug: "fixture-join-words" must equal the directory name "fixture-join-words-copy"$/,
        /fixture-join-words-copy\/meta\.json: slug: duplicate slug "fixture-join-words" \(also in .*fixture-join-words\/meta\.json\)$/,
      ],
    ],
    ["mixed-valid-invalid", [/fixture-join-words\/tests\.json: \[0\]\.expected: expected string, got integer$/]],
  ];

  it.each(cases)("invalid/%s", async (dir, expected) => {
    const errors = await errorsFor(path.join("invalid", dir));
    expect(errors).toHaveLength(expected.length);
    expected.forEach((re, i) => expect(errors[i]).toMatch(re));
  });

  it("fails on a missing or empty directory", async () => {
    expect(await errorsFor("does-not-exist")).toEqual([
      expect.stringMatching(/problems directory not found$/),
    ]);
    expect(await errorsFor("invalid/bad-json/fixture-join-words")).toEqual([
      expect.stringMatching(/no problem directories found$/),
    ]);
  });
});
