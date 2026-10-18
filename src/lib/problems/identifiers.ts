// Function and parameter names must be valid identifiers in Python,
// JavaScript and Java, must not be reserved words in any of them and must not
// shadow globals/builtins that the harness or typical user code relies on.

const PYTHON_KEYWORDS = [
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally", "for",
  "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
  "or", "pass", "raise", "return", "try", "while", "with", "yield",
];

const JS_RESERVED = [
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in",
  "instanceof", "interface", "let", "new", "null", "package", "private",
  "protected", "public", "return", "static", "super", "switch", "this", "throw",
  "true", "try", "typeof", "var", "void", "while", "with", "yield",
  // Not keywords, but not usable as binding names in strict mode / templates.
  "arguments", "eval", "undefined", "NaN", "Infinity",
];

// Java keywords and literals that are not reserved in Python or JavaScript
// (the shared ones are already in the lists above). `_` is a keyword since
// Java 9; `yield` is in JS_RESERVED.
const JAVA_ONLY_RESERVED = [
  "_", "abstract", "assert", "boolean", "byte", "char", "double", "final",
  "float", "goto", "int", "long", "native", "short", "strictfp",
  "synchronized", "throws", "transient", "volatile",
];

// `self` is the method receiver in the generated Python template.
const TEMPLATE_RESERVED = ["self"];

const RESERVED = new Set([...PYTHON_KEYWORDS, ...JS_RESERVED, ...TEMPLATE_RESERVED]);
const JAVA_RESERVED = new Set(JAVA_ONLY_RESERVED);

// A parameter or function with one of these names would shadow a global the
// solution (or harness) is likely to use.
const JS_GLOBALS = [
  "JSON", "console", "Math", "Object", "Array", "Number", "String", "Boolean",
  "Map", "Set", "Promise", "Symbol", "Error", "globalThis", "require", "module",
  "exports", "process", "Function", "Date", "RegExp", "BigInt",
];

const PYTHON_BUILTINS = [
  "input", "list", "dict", "set", "sum", "max", "min", "len", "id", "str", "int",
  "float", "bool", "range", "map", "filter", "sorted", "reversed", "enumerate",
  "zip", "print", "type", "object", "tuple", "abs", "any", "all",
];

const SHADOWING = new Set([...JS_GLOBALS, ...PYTHON_BUILTINS]);

// ASCII intersection of Python and JS identifier syntax (`$` is JS-only).
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Returns null when `name` is usable, otherwise the reason it is not. */
export function identifierProblem(name: string): string | null {
  if (!IDENTIFIER_RE.test(name)) {
    return `"${name}" is not a valid identifier in both Python and JavaScript (use [A-Za-z_][A-Za-z0-9_]*)`;
  }
  if (name.startsWith("__")) {
    return `"${name}" starts with "__" (reserved for Python dunder names and name mangling)`;
  }
  if (RESERVED.has(name)) {
    return `"${name}" is a reserved word in Python or JavaScript`;
  }
  if (SHADOWING.has(name)) {
    return `"${name}" would shadow a JavaScript global or Python builtin`;
  }
  if (JAVA_RESERVED.has(name)) {
    return `"${name}" is a reserved word in Java`;
  }
  return null;
}
