// Line-id coverage between a viz model and its code sample (PLAN-GUIDE 2.7):
// every id the generator can emit has a marker in both listings, and every
// marker is an id the generator knows (no dead markers).
import { readFileSync } from "node:fs";

import { expect } from "vitest";

import { parseMarkedSource } from "@/lib/guide/code/markers";
import type { CodeLanguage, VizModel } from "@/lib/guide/contracts";
import { codeFilePath } from "@/server/guide/code";

export function lineMapOf(ref: string, language: CodeLanguage): Readonly<Record<string, readonly number[]>> {
  const file = codeFilePath(ref, language === "python" ? ".py" : ".js");
  return parseMarkedSource(readFileSync(file, "utf8"), language, file).lineMap;
}

export function expectLineIdsCovered(model: Pick<VizModel<unknown, unknown>, "id" | "lineIds">, ref: string): void {
  const ids = [...model.lineIds].sort();
  for (const language of ["python", "javascript"] as const) {
    const mapped = Object.keys(lineMapOf(ref, language)).sort();
    expect(mapped, `${model.id} vs ${ref} (${language}): marker ids must equal model.lineIds`).toEqual(ids);
  }
}
