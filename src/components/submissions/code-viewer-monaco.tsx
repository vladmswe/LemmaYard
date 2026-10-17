"use client";

// Read-only Monaco for a stored submission (DESIGN.md §9.6). Client only:
// load it through `CodeViewer` (dynamic, ssr: false).
import Editor, { type OnMount } from "@monaco-editor/react";
import { useAppliedTheme } from "@/components/theme-provider";

import { fontMono } from "@/app/fonts";
import { MONACO_EDITOR_OPTIONS, MONACO_TAB_SIZE, monacoThemeFor } from "@/lib/monaco-themes";
import type { Language } from "@/lib/submission-dto";
import { LANGUAGE_LABELS, MONACO_LANGUAGE } from "@/lib/workspace/languages";

// Side effect: bundles Monaco locally (no CDN), sets its worker, registers the themes.
import "@/components/problem/monaco/setup";

export type CodeViewerMonacoProps = { id: string; language: Language; code: string };

export default function CodeViewerMonaco({ id, language, code }: CodeViewerMonacoProps) {
  const resolvedTheme = useAppliedTheme();

  const handleMount: OnMount = (_editor, m) => {
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => m.editor.remeasureFonts());
    }
  };

  return (
    <Editor
      height="100%"
      width="100%"
      // Own model per submission: never shares the problem page's draft models.
      path={`file:///submissions/${id}/${MONACO_LANGUAGE[language].file}`}
      language={MONACO_LANGUAGE[language].id}
      value={code}
      theme={monacoThemeFor(resolvedTheme)}
      onMount={handleMount}
      loading={null}
      options={{
        ...MONACO_EDITOR_OPTIONS,
        fontFamily: fontMono.style.fontFamily,
        tabSize: MONACO_TAB_SIZE[language],
        readOnly: true,
        domReadOnly: true,
        readOnlyMessage: { value: "This is a past submission. Use Submit again to edit it." },
        lineNumbers: "on",
        padding: { top: 12, bottom: 12 },
        minimap: { enabled: false },
        ariaLabel: `Submitted code, ${LANGUAGE_LABELS[language]}, read-only`,
        renderLineHighlight: "none",
        // Tab moves focus on: a read-only editor must not trap the keyboard.
        tabFocusMode: true,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: { alwaysConsumeMouseWheel: false },
        contextmenu: false,
      }}
    />
  );
}
