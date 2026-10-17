// Generator of "prefix.sums": build p (n + 1 cells, p[0] = 0), then answer one
// range-sum query [l, r) as p[r] - p[l].
import type { Counters, ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import type { PrefixCell, PrefixInput, PrefixState } from "./types";

function sub(x: number, y: number): string {
  return y < 0 ? `${x} - (${y})` : `${x} - ${y}`;
}
function add(x: number, y: number): string {
  return y < 0 ? `${x} + (${y})` : `${x} + ${y}`;
}

export function generatePrefix(input: PrefixInput): Trace<PrefixState, number> {
  const a: PrefixCell[] = input.values.map((value, k) => ({ id: `a${k}`, value }));
  const n = a.length;
  const { l, r } = input;
  const p: (PrefixCell | null)[] = Array.from({ length: n + 1 }, () => null);
  let reads = 0;
  let writes = 0;
  const frames: Frame<PrefixState>[] = [];
  const snap = (result: number | null = null): PrefixState => ({ a, p: p.slice(), l, r, result });
  const counters = (): Counters => ({ reads, writes });

  frames.push({
    state: snap(),
    roles: {},
    line: null,
    phase: "Start",
    narration: `We will build the prefix sums p of these ${n} numbers in one pass, then answer the sum of [${l}, ${r}) with one subtraction.`,
    counters: counters(),
    key: true,
  });

  p[0] = { id: "p0", value: 0 };
  writes++;
  frames.push({
    state: snap(),
    roles: { p0: "new" },
    line: "prefix.build.init",
    phase: "Sentinel p[0] = 0",
    narration: `p has n + 1 = ${n + 1} cells. p[0] = 0 is the sum of the empty prefix [0, 0); this sentinel saves a special case when l = 0.`,
    counters: counters(),
  });

  for (let i = 0; i < n; i++) {
    const prev = p[i] as PrefixCell;
    const ai = a[i] as PrefixCell;
    const value = prev.value + ai.value;
    p[i + 1] = { id: `p${i + 1}`, value };
    reads += 2;
    writes++;
    let prompt: PredictPrompt | undefined;
    if (i === 2) {
      const vals = [...new Set([value, ai.value, prev.value, value + ai.value, value + 1])].slice(0, 4);
      prompt = {
        id: "prefix-next",
        question: `p[2] = ${prev.value} and a[2] = ${ai.value}. What value goes into p[3]?`,
        choices: vals.sort((x, y) => x - y).map((v) => ({ id: `v${v}`, label: String(v) })),
        answerId: `v${value}`,
        explain: `p[3] = p[2] + a[2] = ${add(prev.value, ai.value)} = ${value}, the sum of the first 3 numbers.`,
      };
    }
    frames.push({
      state: snap(),
      roles: { [prev.id]: "compared", [ai.id]: "compared", [`p${i + 1}`]: "new" },
      line: "prefix.build.step",
      phase: "Add the next number",
      narration: `p[${i + 1}] = p[${i}] + a[${i}] = ${add(prev.value, ai.value)} = ${value}: ${i === 0 ? "just the first number" : `the sum of the first ${i + 1} numbers`}.`,
      counters: counters(),
      ...(prompt ? { prompt } : {}),
      ...(i === n - 1 ? { key: true } : {}),
    });
  }

  const pl = p[l] as PrefixCell;
  const pr = p[r] as PrefixCell;
  const result = pr.value - pl.value;
  reads += 2;
  const roles: Record<ElementId, Role> = {};
  for (let k = l; k < r; k++) roles[(a[k] as PrefixCell).id] = "visited";
  roles[pl.id] = "compared";
  roles[pr.id] = "compared";
  const cand: [number, number][] = [
    [r, l],
    [r - 1, l],
    [r, l - 1],
    [r + 1, l],
    [r + 1, l + 1],
  ];
  const seen = new Set<string>();
  const pairs = cand.filter(([x, y]) => {
    const k = `${x}-${y}`;
    if (x < 0 || y < 0 || x > n || y > n || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const prompt: PredictPrompt = {
    id: "prefix-cells",
    question: `Which two cells of p give the sum of [${l}, ${r})?`,
    choices: pairs.slice(0, 4).map(([x, y]) => ({ id: `p${x}-p${y}`, label: `p[${x}] - p[${y}]` })),
    answerId: `p${r}-p${l}`,
    explain:
      l === r
        ? `[${l}, ${r}) is empty, and p[${r}] - p[${l}] = 0 says exactly that: the same cell subtracted from itself.`
        : `p[${r}] holds the first ${r} numbers and p[${l}] the first ${l}, so p[${r}] - p[${l}] leaves exactly a[${l}] up to a[${r - 1}]: ${r - l} number${r - l === 1 ? "" : "s"}.`,
  };
  frames.push({
    state: snap(result),
    roles,
    line: "prefix.query",
    phase: "Answer the query",
    narration:
      l === r
        ? `The sum of [${l}, ${r}) is p[${r}] - p[${l}] = 0: the range is empty, and no special case was needed.`
        : `The sum of [${l}, ${r}) is p[${r}] - p[${l}] = ${sub(pr.value, pl.value)} = ${result}. Two reads, whatever the length of the range.`,
    counters: counters(),
    prompt,
    key: true,
  });
  return { vizId: "prefix.sums", frames, result };
}
