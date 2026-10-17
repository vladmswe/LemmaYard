// Value types of problem signatures (PLAN.md section 5). Pure TS, safe for the
// client: used by the importer now and for custom input validation later.

export type ScalarType = "int" | "float" | "bool" | "string";

export type ValueType =
  | { kind: "scalar"; name: ScalarType }
  | { kind: "array"; of: ValueType };

export type SignatureParam = { name: string; type: string };

export type SignatureLike = {
  name: string;
  params: readonly SignatureParam[];
  returns: string;
};

const SCALARS: readonly ScalarType[] = ["int", "float", "bool", "string"];

/** Maximum array nesting: `T[]` and `T[][]`. */
export const MAX_ARRAY_DEPTH = 2;

/** Parses `int`, `float`, `bool`, `string`, `T[]`, `T[][]`; returns null otherwise. */
export function parseType(source: string): ValueType | null {
  let depth = 0;
  let rest = source;
  while (rest.endsWith("[]")) {
    rest = rest.slice(0, -2);
    depth += 1;
  }
  if (depth > MAX_ARRAY_DEPTH) return null;
  if (!(SCALARS as readonly string[]).includes(rest)) return null;
  let type: ValueType = { kind: "scalar", name: rest as ScalarType };
  for (let i = 0; i < depth; i++) type = { kind: "array", of: type };
  return type;
}

export function isValidTypeString(source: string): boolean {
  return parseType(source) !== null;
}

/** Inverse of `parseType`. */
export function formatType(type: ValueType): string {
  return type.kind === "scalar" ? type.name : `${formatType(type.of)}[]`;
}

export type ValueIssue = { path: string; message: string };

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? "integer" : "non-integer number";
  }
  return typeof value;
}

/**
 * Checks a JSON value against a type. `int` = integer within ±(2^53−1),
 * `float` = any finite number, `bool` = boolean, `string` = string.
 * Returns every mismatch with a JSON-path-like location (`$`, `$[2][0]`).
 */
export function validateValue(
  value: unknown,
  type: ValueType,
  path = "$",
): ValueIssue[] {
  if (type.kind === "array") {
    if (!Array.isArray(value)) {
      return [{ path, message: `expected ${formatType(type)}, got ${describe(value)}` }];
    }
    return value.flatMap((item, i) => validateValue(item, type.of, `${path}[${i}]`));
  }
  const fail = (): ValueIssue[] => [
    { path, message: `expected ${type.name}, got ${describe(value)}` },
  ];
  switch (type.name) {
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) return fail();
      if (!Number.isSafeInteger(value)) {
        return [{ path, message: "int is outside the range ±(2^53−1)" }];
      }
      return [];
    case "float":
      return typeof value === "number" && Number.isFinite(value) ? [] : fail();
    case "bool":
      return typeof value === "boolean" ? [] : fail();
    case "string":
      return typeof value === "string" ? [] : fail();
  }
}

/**
 * Checks an input object against a signature: keys must equal the parameter
 * names exactly and each value must match its parameter type.
 */
export function validateInput(input: unknown, signature: SignatureLike): ValueIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ path: "$", message: `expected an object, got ${describe(input)}` }];
  }
  const record = input as Record<string, unknown>;
  const names = signature.params.map((p) => p.name);
  const issues: ValueIssue[] = [];
  for (const name of names) {
    if (!Object.hasOwn(record, name)) {
      issues.push({ path: "$", message: `missing parameter "${name}"` });
    }
  }
  for (const key of Object.keys(record)) {
    if (!names.includes(key)) {
      issues.push({ path: "$", message: `unknown parameter "${key}"` });
    }
  }
  for (const param of signature.params) {
    if (!Object.hasOwn(record, param.name)) continue;
    const type = parseType(param.type);
    if (!type) {
      issues.push({ path: `$.${param.name}`, message: `unknown type "${param.type}"` });
      continue;
    }
    issues.push(...validateValue(record[param.name], type, `$.${param.name}`));
  }
  return issues;
}

export type UnsafeIntegerLiteral = { literal: string; line: number; column: number };

/**
 * Finds integer literals beyond ±(2^53−1) in raw JSON text. `JSON.parse`
 * silently rounds them, so this must run on the text before parsing.
 * Literals with a fraction or exponent are left to the type check.
 */
export function findUnsafeIntegerLiterals(text: string): UnsafeIntegerLiteral[] {
  const found: UnsafeIntegerLiteral[] = [];
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const numberRe = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let line = 1;
  let lineStart = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") {
      line += 1;
      lineStart = i + 1;
      i += 1;
    } else if (ch === '"') {
      // Skip the string, honoring escapes.
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      i += 1;
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      numberRe.lastIndex = i;
      const match = numberRe.exec(text);
      if (!match) {
        i += 1;
        continue;
      }
      const literal = match[0];
      if (/^-?\d+$/.test(literal)) {
        const magnitude = BigInt(literal.replace("-", ""));
        if (magnitude > max) found.push({ literal, line, column: i - lineStart + 1 });
      }
      i += literal.length;
    } else {
      i += 1;
    }
  }
  return found;
}
