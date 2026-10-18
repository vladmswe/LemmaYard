// Client-only Monaco bootstrap (PLAN.md §2, AC-M5-1). Imported only from
// `code-editor.tsx`, which is loaded with `dynamic(..., { ssr: false })`.
//
// - The editor is bundled from node_modules (`loader.config({ monaco })`), so
//   @monaco-editor/react never fetches its default CDN copy.
// - Tree-shaken entry points (monaco-editor >= 0.56): the core editor, the
//   editor features, and only the Python, JavaScript and Java Monarch grammars. No
//   TypeScript/JSON/CSS/HTML language services, so no language workers.
// - The one worker Monaco needs (editor.worker: word suggestions, links,
//   diff) is built by the bundler from `new Worker(new URL(...))`, which both
//   Turbopack (`next dev`, `next build`) and webpack understand.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/java/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/python/register";

import { MONACO_THEMES } from "@/lib/monaco-themes";

type MonacoEnvironmentShape = { getWorker: (workerId: string, label: string) => Worker };

(globalThis as { MonacoEnvironment?: MonacoEnvironmentShape }).MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL("./editor.worker.ts", import.meta.url), {
      type: "module",
      name: "monaco-editor-worker",
    }),
};

for (const [name, theme] of Object.entries(MONACO_THEMES)) {
  monaco.editor.defineTheme(name, theme);
}

// The react wrapper's types expect the full `monaco-editor` namespace; the
// tree-shaken `monaco-editor/editor` is the same API object at runtime.
loader.config({ monaco: monaco as unknown as Parameters<typeof loader.config>[0]["monaco"] });


