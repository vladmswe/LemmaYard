// Hand-written CodeBundle for the "scan-code" fixture (Shiki and the real
// code pipeline belong to M-G1). Lines carry data-line / data-line-ids like
// the pipeline's output, so the code panel can be tested now.
import type { CodeBundle, CodeLanguage, CodeListing, LineId } from "@/lib/guide/contracts";

type Src = readonly (string | readonly [string, LineId])[];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function listing(ref: string, language: CodeLanguage, src: Src): CodeListing {
  const lineMap: Record<LineId, number[]> = {};
  const rows = src.map((entry, k) => {
    const n = k + 1;
    const [text, id] = typeof entry === "string" ? [entry, null] : entry;
    if (id) (lineMap[id] ??= []).push(n);
    const ids = id ? ` data-line-ids="${id}"` : "";
    return `<span class="line" data-line="${n}"${ids}>${escapeHtml(text) || " "}</span>`;
  });
  return {
    ref,
    language,
    html: `<pre class="shiki"><code>${rows.join("\n")}</code></pre>`,
    lineMap,
    source: src.map((e) => (typeof e === "string" ? e : e[0])).join("\n"),
  };
}

const DOC = [
  "Linear search, the simplest search there is.",
  "",
  "It looks at every element from left to right and",
  "stops at the first one that equals the target.",
  "",
  "  * Works on any list: sorted or not.",
  "  * Needs no extra memory.",
  "  * Costs one comparison per element it looks at:",
  "    n comparisons in the worst case (target missing",
  "    or last), 1 in the best case (target first).",
  "",
  "That is O(n) time in the worst case.",
  "",
  "Arguments:",
  "  values: the list to search",
  "  target: the value to find",
  "",
  "Returns the index of the first match, or -1.",
];

const python: Src = [
  "def linear_search(values, target):",
  '    """',
  ...DOC.map((l) => (l ? `    ${l}` : "")),
  '    """',
  "    for i in range(len(values)):",
  ["        if values[i] == target:", "demo.scan.compare"],
  ["            return i", "demo.scan.found"],
  ["    return -1", "demo.scan.notFound"],
  "",
  "",
  "print(linear_search([4, 8, 15, 16, 23, 42], 23))  # 4",
];

const javascript: Src = [
  "/**",
  ...DOC.map((l) => (l ? ` * ${l}` : " *")),
  " */",
  "function linearSearch(values, target) {",
  "  for (let i = 0; i < values.length; i++) {",
  ["    if (values[i] === target) {", "demo.scan.compare"],
  ["      return i;", "demo.scan.found"],
  "    }",
  "  }",
  ["  return -1;", "demo.scan.notFound"],
  "}",
  "",
  "console.log(linearSearch([4, 8, 15, 16, 23, 42], 23)); // 4",
];

export const SCAN_CODE: CodeBundle = {
  python: listing("dev-fixtures/linear_search", "python", python),
  javascript: listing("dev-fixtures/linear_search", "javascript", javascript),
};
