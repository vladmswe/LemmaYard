// Starter code generated from a problem signature (PLAN.md section 5).
import { parseType, RETURN_POSITION, type SignatureLike, type ValueType } from "@/lib/types";

export type TemplateLanguage = "python" | "javascript" | "java";

/** Per-problem hints for statically typed templates. */
export type TemplateOptions = {
  /**
   * Signature positions (parameter names or "return") whose ints need 64 bits
   * (`problems.wide_ints`, see `wideIntPositions`): Java declares them `long`.
   */
  wideInts?: readonly string[];
};

function mustParse(source: string): ValueType {
  const type = parseType(source);
  if (!type) throw new Error(`unknown type "${source}"`);
  return type;
}

const PY_SCALARS = { int: "int", float: "float", bool: "bool", string: "str" } as const;
const JS_SCALARS = { int: "number", float: "number", bool: "boolean", string: "string" } as const;
const JAVA_SCALARS = { int: "int", float: "double", bool: "boolean", string: "String" } as const;

function pythonType(type: ValueType): string {
  return type.kind === "scalar" ? PY_SCALARS[type.name] : `List[${pythonType(type.of)}]`;
}

function jsType(type: ValueType): string {
  return type.kind === "scalar" ? JS_SCALARS[type.name] : `${jsType(type.of)}[]`;
}

/**
 * Java type of a signature type: `int` → `int` (or `long` when `wide`),
 * `float` → `double`, `bool` → `boolean`, `string` → `String`, `T[]` → Java
 * arrays. The harness also accepts other declarations (`long` for `int`,
 * `List<Integer>` for `int[]`, ...), see sandbox/Harness.java.
 */
export function javaType(type: ValueType, wide = false): string {
  if (type.kind === "array") return `${javaType(type.of, wide)}[]`;
  return type.name === "int" && wide ? "long" : JAVA_SCALARS[type.name];
}

export function pythonTemplate(signature: SignatureLike): string {
  const params = signature.params
    .map((p) => `${p.name}: ${pythonType(mustParse(p.type))}`)
    .join(", ");
  const returns = pythonType(mustParse(signature.returns));
  return [
    "from typing import List",
    "",
    "",
    "class Solution:",
    `    def ${signature.name}(self, ${params}) -> ${returns}:`,
    "        pass",
    "",
  ].join("\n");
}

export function javascriptTemplate(signature: SignatureLike): string {
  const doc = [
    "/**",
    ...signature.params.map((p) => ` * @param {${jsType(mustParse(p.type))}} ${p.name}`),
    ` * @return {${jsType(mustParse(signature.returns))}}`,
    " */",
  ];
  const params = signature.params.map((p) => p.name).join(", ");
  return [...doc, `var ${signature.name} = function(${params}) {`, "", "};", ""].join("\n");
}

export function javaTemplate(signature: SignatureLike, options: TemplateOptions = {}): string {
  const wide = new Set(options.wideInts ?? []);
  const params = signature.params
    .map((p) => `${javaType(mustParse(p.type), wide.has(p.name))} ${p.name}`)
    .join(", ");
  const returns = javaType(mustParse(signature.returns), wide.has(RETURN_POSITION));
  return [
    "import java.util.*;",
    "",
    "class Solution {",
    `    public ${returns} ${signature.name}(${params}) {`,
    "",
    "    }",
    "}",
    "",
  ].join("\n");
}

export function generateTemplate(
  signature: SignatureLike,
  language: TemplateLanguage,
  options: TemplateOptions = {},
): string {
  switch (language) {
    case "python":
      return pythonTemplate(signature);
    case "javascript":
      return javascriptTemplate(signature);
    case "java":
      return javaTemplate(signature, options);
  }
}
