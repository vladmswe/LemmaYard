// Fixture visualizations of M-G0: "demo.scan" (linear scan of an int array) and
// "demo.tree" (search walk in a 7-node BST). They exercise the player and the
// SVG primitives; lessons ship their own models.
import type {
  ElementId,
  Frame,
  InputSpec,
  PredictPrompt,
  Role,
  Trace,
  VizModel,
} from "../../contracts";
import { parseIntList } from "../../input/parsers";
import { mulberry32, randomInt } from "../../random";

// ---------------------------------------------------------------- demo.scan

export interface ScanItem {
  readonly id: ElementId;
  readonly value: number;
}
export interface ScanState {
  readonly items: readonly ScanItem[];
  readonly target: number;
  readonly i: number | null; // index being compared
  readonly found: number | null; // index where the target was found
}
export interface ScanInput {
  readonly values: readonly number[];
  readonly target: number;
}

export const SCAN_MAX_VALUES = 12;
export const SCAN_MIN = -99;
export const SCAN_MAX = 999;
const SCAN_LINES = ["demo.scan.compare", "demo.scan.found", "demo.scan.notFound"];

function formatScan(v: ScanInput): string {
  return `${v.values.join(", ")}; ${v.target}`;
}

function parseScan(raw: string) {
  const parts = raw.split(";");
  if (parts.length !== 2) {
    return { ok: false as const, error: "Write the numbers, a semicolon, then the target, e.g. 7, 3, 9; 9" };
  }
  const values = parseIntList(parts[0] as string, { min: SCAN_MIN, max: SCAN_MAX, maxCount: SCAN_MAX_VALUES });
  if (!values.ok) return values;
  const target = parseIntList(parts[1] as string, { min: SCAN_MIN, max: SCAN_MAX, maxCount: 1 });
  if (!target.ok) return { ok: false as const, error: `Target: ${target.error}` };
  return { ok: true as const, value: { values: values.value, target: target.value[0] as number } };
}

const scanInput: InputSpec<ScanInput> = {
  label: "Numbers and target",
  placeholder: "7, 3, 9, 4; 9",
  help: `Up to ${SCAN_MAX_VALUES} whole numbers from ${SCAN_MIN} to ${SCAN_MAX}, comma separated, then a semicolon and the target`,
  maxLength: 120,
  parse: parseScan,
  format: formatScan,
  presets: [
    { id: "middle", label: "Target in the middle", value: { values: [4, 8, 15, 16, 23, 42], target: 16 } },
    { id: "missing", label: "Target missing", value: { values: [5, 1, 9, 3], target: 7 } },
    { id: "first", label: "Target first", value: { values: [2, 7, 1, 8], target: 2 } },
  ],
};

const SCAN_DEFAULT: ScanInput = { values: [4, 8, 15, 16, 23, 42], target: 23 };

function scanIds(s: ScanState): ElementId[] {
  return s.items.map((it) => it.id);
}

function generateScan(input: ScanInput): Trace<ScanState> {
  const items: ScanItem[] = input.values.map((value, k) => ({ id: `c${k}`, value }));
  const target = input.target;
  const frames: Frame<ScanState>[] = [];
  const n = items.length;
  frames.push({
    state: { items, target, i: null, found: null },
    roles: {},
    line: null,
    phase: "Start",
    narration: `We will scan these ${n} numbers from left to right, looking for ${target}.`,
    counters: { comparisons: 0 },
    key: true,
  });
  let comparisons = 0;
  let found: number | null = null;
  for (let i = 0; i < n; i++) {
    const item = items[i] as ScanItem;
    comparisons++;
    const roles: Record<ElementId, Role> = {};
    for (let k = 0; k < i; k++) roles[(items[k] as ScanItem).id] = "visited";
    roles[item.id] = "compared";
    const equal = item.value === target;
    const prompt: PredictPrompt | undefined =
      i === 2
        ? {
            id: "scan-third",
            question: `Index 2 holds ${item.value}. Will the scan stop there?`,
            choices: [
              { id: "yes", label: `Yes, ${item.value} is the target` },
              { id: "no", label: `No, ${item.value} is not ${target}` },
            ],
            answerId: equal ? "yes" : "no",
            explain: equal
              ? `${item.value} equals ${target}, so the scan stops at index 2.`
              : `${item.value} is not ${target}, so the scan moves on to index 3.`,
          }
        : undefined;
    frames.push({
      state: { items, target, i, found: null },
      roles,
      pointers: { i: item.id },
      line: "demo.scan.compare",
      phase: "Compare",
      narration: equal
        ? `Compare ${item.value} at index ${i} with ${target}. They are equal, so the target is here.`
        : `Compare ${item.value} at index ${i} with ${target}. They differ, so move on to the next index.`,
      counters: { comparisons },
      ...(prompt ? { prompt } : {}),
      ...(i === 0 ? { key: true } : {}),
    });
    if (equal) {
      found = i;
      break;
    }
  }
  if (found !== null) {
    const roles: Record<ElementId, Role> = {};
    for (let k = 0; k < found; k++) roles[(items[k] as ScanItem).id] = "visited";
    roles[(items[found] as ScanItem).id] = "done";
    frames.push({
      state: { items, target, i: found, found },
      roles,
      pointers: { i: (items[found] as ScanItem).id },
      line: "demo.scan.found",
      phase: "Found",
      narration: `Return index ${found}: ${target} was found after ${comparisons} comparison${comparisons === 1 ? "" : "s"}.`,
      counters: { comparisons },
      key: true,
    });
  } else {
    const roles: Record<ElementId, Role> = {};
    for (const it of items) roles[it.id] = "visited";
    frames.push({
      state: { items, target, i: null, found: null },
      roles,
      line: "demo.scan.notFound",
      phase: "Not found",
      narration: `Return -1: all ${n} numbers were compared and none equals ${target}.`,
      counters: { comparisons },
      key: true,
    });
  }
  return { vizId: "demo.scan", frames };
}

export const demoScanModel: VizModel<ScanState, ScanInput> = {
  id: "demo.scan",
  title: "Linear scan",
  generate: generateScan,
  describe(s) {
    const cells = s.items.map((it) => `${it.value}`).join(", ");
    let where = "";
    if (s.found !== null) where = ` Found ${s.target} at index ${s.found}.`;
    else if (s.i !== null) where = ` Comparing index ${s.i}, which holds ${s.items[s.i]?.value}.`;
    return `Array of ${s.items.length} numbers: ${cells}. Target ${s.target}.${where}`;
  },
  ids: scanIds,
  defaultInput: SCAN_DEFAULT,
  input: scanInput,
  lineIds: SCAN_LINES,
  counters: ["comparisons"],
};

/** "Random" preset of the scan fixture: 5..10 numbers, the target present 2 times out of 3. */
export function randomScanInput(seed: number): ScanInput {
  const rng = mulberry32(seed);
  const n = randomInt(rng, 5, 10);
  const values = Array.from({ length: n }, () => randomInt(rng, 1, 60));
  const target = rng() < 2 / 3 ? (values[randomInt(rng, 0, n - 1)] as number) : randomInt(rng, 61, 99);
  return { values, target };
}

export function scanTable(s: ScanState) {
  return {
    caption: `Array, target ${s.target}`,
    columns: ["Index", "Value", "Status"],
    rows: s.items.map((it, k) => [
      k,
      it.value,
      s.found === k ? "found" : s.i === k ? "comparing" : s.i !== null && k < s.i ? "checked" : "",
    ]),
  };
}

// ---------------------------------------------------------------- demo.tree

export interface TreeNodeState {
  readonly id: ElementId;
  readonly key: number;
  readonly left: ElementId | null;
  readonly right: ElementId | null;
}
export interface TreeState {
  readonly nodes: readonly TreeNodeState[];
  readonly root: ElementId;
  readonly target: number;
  readonly at: ElementId | null;
}
export interface TreeInput {
  readonly target: number;
}

const TREE_KEYS = [8, 4, 12, 2, 6, 10, 14];
const TREE_LINES = ["demo.tree.compare", "demo.tree.left", "demo.tree.right", "demo.tree.found", "demo.tree.missing"];

function buildTree(): TreeState["nodes"] {
  const nodes = new Map<number, { id: ElementId; key: number; left: ElementId | null; right: ElementId | null }>();
  const rootKey = TREE_KEYS[0] as number;
  for (const key of TREE_KEYS) {
    nodes.set(key, { id: `n${key}`, key, left: null, right: null });
    if (key === rootKey) continue;
    let cur = nodes.get(rootKey)!;
    for (;;) {
      const side = key < cur.key ? "left" : "right";
      const next = cur[side];
      if (next === null) {
        cur[side] = `n${key}`;
        break;
      }
      cur = nodes.get(Number(next.slice(1)))!;
    }
  }
  return TREE_KEYS.map((k) => nodes.get(k)!);
}

function generateTree(input: TreeInput): Trace<TreeState> {
  const nodes = buildTree();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes[0]!.id;
  const target = input.target;
  const frames: Frame<TreeState>[] = [
    {
      state: { nodes, root, target, at: null },
      roles: {},
      line: null,
      phase: "Start",
      narration: `We will search this binary search tree for ${target}, starting at the root.`,
      counters: { comparisons: 0, nodesVisited: 0 },
      key: true,
    },
  ];
  const path: ElementId[] = [];
  let at: ElementId | null = root;
  let comparisons = 0;
  let promptUsed = false;
  while (at !== null) {
    const node: TreeNodeState = byId.get(at)!;
    comparisons++;
    const roles: Record<ElementId, Role> = {};
    for (const p of path) roles[p] = "path";
    roles[node.id] = "current";
    path.push(node.id);
    if (node.key === target) {
      frames.push({
        state: { nodes, root, target, at: node.id },
        roles: { ...roles, [node.id]: "done" },
        pointers: { curr: node.id },
        line: "demo.tree.found",
        phase: "Found",
        narration: `Compare ${target} with ${node.key}: equal, so the search ends at this node.`,
        counters: { comparisons, nodesVisited: path.length },
        key: true,
      });
      return { vizId: "demo.tree", frames, result: true };
    }
    const goLeft = target < node.key;
    const next = goLeft ? node.left : node.right;
    const prompt: PredictPrompt | undefined =
      !promptUsed && path.length === 1
        ? {
            id: "tree-root-side",
            question: `${target} vs the root ${node.key}: which way does the search go?`,
            choices: [
              { id: "left", label: "Left subtree" },
              { id: "right", label: "Right subtree" },
            ],
            answerId: goLeft ? "left" : "right",
            explain: `${target} is ${goLeft ? "smaller" : "larger"} than ${node.key}, and ${goLeft ? "smaller keys live on the left" : "larger keys live on the right"}.`,
          }
        : undefined;
    if (prompt) promptUsed = true;
    frames.push({
      state: { nodes, root, target, at: node.id },
      roles,
      pointers: { curr: node.id },
      line: goLeft ? "demo.tree.left" : "demo.tree.right",
      phase: goLeft ? "Go left" : "Go right",
      narration: `Compare ${target} with ${node.key}: ${target} is ${goLeft ? "smaller, so go left" : "larger, so go right"}.`,
      counters: { comparisons, nodesVisited: path.length },
      ...(prompt ? { prompt } : {}),
    });
    at = next;
  }
  const roles: Record<ElementId, Role> = {};
  for (const p of path) roles[p] = "visited";
  frames.push({
    state: { nodes, root, target, at: null },
    roles,
    line: "demo.tree.missing",
    phase: "Not found",
    narration: `The next child is empty, so ${target} is not in the tree after ${comparisons} comparisons.`,
    counters: { comparisons, nodesVisited: path.length },
    key: true,
  });
  return { vizId: "demo.tree", frames, result: false };
}

export const demoTreeModel: VizModel<TreeState, TreeInput> = {
  id: "demo.tree",
  title: "Tree search",
  generate: generateTree,
  describe(s) {
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    const list = s.nodes
      .map((n) => {
        const l = n.left ? byId.get(n.left)?.key : "none";
        const r = n.right ? byId.get(n.right)?.key : "none";
        return `${n.key} (left ${l}, right ${r})`;
      })
      .join("; ");
    const at = s.at ? ` Current node ${byId.get(s.at)?.key}.` : "";
    return `Binary search tree, root ${byId.get(s.root)?.key}: ${list}. Searching for ${s.target}.${at}`;
  },
  ids: (s) => s.nodes.map((n) => n.id),
  defaultInput: { target: 10 },
  lineIds: TREE_LINES,
  counters: ["comparisons", "nodesVisited"],
};

export function treeTable(s: TreeState) {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const keyOf = (id: ElementId | null) => (id ? (byId.get(id)?.key ?? "") : "none");
  return {
    caption: `Binary search tree, searching for ${s.target}`,
    columns: ["Key", "Left child", "Right child", "Current"],
    rows: s.nodes.map((n) => [n.key, keyOf(n.left), keyOf(n.right), s.at === n.id ? "yes" : ""]),
  };
}

/** Target keys that exercise every branch of demo.tree (property tests pick from -5..20). */
export const TREE_TARGET_RANGE = { min: -5, max: 20 } as const;
