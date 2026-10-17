// Starter code generated from a problem signature (PLAN.md section 5).
import { parseType, type SignatureLike, type ValueType } from "@/lib/types";

export type TemplateLanguage = "python" | "javascript";

function mustParse(source: string): ValueType {
  const type = parseType(source);
  if (!type) throw new Error(`unknown type "${source}"`);
  return type;
}

const PY_SCALARS = { int: "int", float: "float", bool: "bool", string: "str" } as const;
const JS_SCALARS = { int: "number", float: "number", bool: "boolean", string: "string" } as const;

function pythonType(type: ValueType): string {
  return type.kind === "scalar" ? PY_SCALARS[type.name] : `List[${pythonType(type.of)}]`;
}

function jsType(type: ValueType): string {
  return type.kind === "scalar" ? JS_SCALARS[type.name] : `${jsType(type.of)}[]`;
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

export function generateTemplate(signature: SignatureLike, language: TemplateLanguage): string {
  return language === "python" ? pythonTemplate(signature) : javascriptTemplate(signature);
}
