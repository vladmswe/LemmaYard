import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The JS harness runs as a CommonJS script inside the Node sandbox image.
    files: ["sandbox/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees (local only, untracked).
    ".claude/**",
    // Problem solutions and fixtures define a global function by design.
    "problems/**",
    "tests/fixtures/**",
    "tests/unit/__golden__/**",
  ]),
]);

export default eslintConfig;
