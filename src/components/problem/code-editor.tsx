"use client";

// Monaco editor of the problem workspace. Client only: load it through
// `LazyCodeEditor` (dynamic, ssr: false), never import it from a server file.
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { fontMono } from "@/app/fonts";
import type { Language } from "@/lib/submission-dto";
import { MONACO_EDITOR_OPTIONS, MONACO_TAB_SIZE, monacoThemeFor } from "@/lib/monaco-themes";
import { LANGUAGE_LABELS, MONACO_LANGUAGE } from "@/lib/workspace/languages";
import { registerRunSubmitShortcuts, type ShortcutHandlers } from "@/lib/workspace/shortcuts";

// Side effect: bundles Monaco, sets its worker, registers the themes.
import "./monaco/setup";

export type CodeEditorHandle = {
  /** Replaces the current model's text as one undoable edit (Reset). */
  replaceAll(code: string): void;
  focus(): void;
};

export type CodeEditorProps = {
  slug: string;
  language: Language;
  /** Text for a model created for the first time (per language). */
  value: string;
  onChange: (code: string) => void;
  onCursorChange: (line: number, column: number) => void;
  shortcuts: () => ShortcutHandlers;
  handleRef: React.RefObject<CodeEditorHandle | null>;
};

type StandaloneEditor = Parameters<OnMount>[0];

export default function CodeEditor({
  slug,
  language,
  value,
  onChange,
  onCursorChange,
  shortcuts,
  handleRef,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<StandaloneEditor | null>(null);
  const cursorRef = useRef(onCursorChange);
  useEffect(() => {
    cursorRef.current = onCursorChange;
  }, [onCursorChange]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      tabSize: MONACO_TAB_SIZE[language],
      ariaLabel: ariaLabelFor(language),
    });
  }, [language]);

  const handleMount: OnMount = (editor, m) => {
    editorRef.current = editor;
    handleRef.current = {
      replaceAll(code) {
        const model = editor.getModel();
        if (!model) return;
        editor.pushUndoStop();
        editor.executeEdits("reset", [{ range: model.getFullModelRange(), text: code }]);
        editor.pushUndoStop();
        editor.setPosition({ lineNumber: 1, column: 1 });
      },
      focus: () => editor.focus(),
    };

    registerRunSubmitShortcuts(editor, m, shortcuts);

    // Keyboard users: Escape, then Tab leaves the editor instead of
    // indenting (Monaco's own toggle Ctrl+M / Ctrl+Shift+M also works).
    let tabLeaves = false;
    const setTabLeaves = (next: boolean) => {
      if (tabLeaves === next) return;
      tabLeaves = next;
      editor.updateOptions({ tabFocusMode: next });
    };
    editor.onKeyDown((e) => {
      if (e.keyCode === m.KeyCode.Escape) setTabLeaves(true);
      else if (e.keyCode !== m.KeyCode.Tab && e.keyCode !== m.KeyCode.Shift) setTabLeaves(false);
    });
    editor.onDidBlurEditorText(() => setTabLeaves(false));

    editor.onDidChangeCursorPosition((e) => cursorRef.current(e.position.lineNumber, e.position.column));
    const pos = editor.getPosition();
    if (pos) cursorRef.current(pos.lineNumber, pos.column);

    // next/font loads JetBrains Mono asynchronously; re-measure once it is in.
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => m.editor.remeasureFonts());
    }
  };

  return (
    <div data-testid="code-editor" className="absolute inset-0">
      <Editor
        height="100%"
        width="100%"
        path={`file:///${slug}/${MONACO_LANGUAGE[language].file}`}
        language={MONACO_LANGUAGE[language].id}
        defaultValue={value}
        theme={monacoThemeFor(resolvedTheme)}
        onChange={(next) => onChange(next ?? "")}
        onMount={handleMount}
        loading={null}
        options={{
          ...MONACO_EDITOR_OPTIONS,
          fontFamily: fontMono.style.fontFamily,
          tabSize: MONACO_TAB_SIZE[language],
          ariaLabel: ariaLabelFor(language),
          fixedOverflowWidgets: true,
          // No overview ruler: its cursor tick reads as a stray mark next to the scrollbar.
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
        }}
      />
    </div>
  );
}

function ariaLabelFor(language: Language): string {
  return `Code editor, ${LANGUAGE_LABELS[language]}. Press Escape, then Tab to move focus out of the editor.`;
}
