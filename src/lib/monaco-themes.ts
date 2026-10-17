/**
 * Monaco editor themes (DESIGN.md §10). Plain data so this module needs no
 * Monaco dependency; the shapes match `monaco.editor.IStandaloneThemeData`.
 *
 * Register once before the first editor mounts (`beforeMount` of
 * `@monaco-editor/react`):
 *
 *   for (const [name, theme] of Object.entries(MONACO_THEMES))
 *     monaco.editor.defineTheme(name, theme);
 *   monaco.editor.setTheme(monacoThemeFor(resolvedTheme));
 *
 * Editor options: see `MONACO_EDITOR_OPTIONS` (pass `fontFamily:
 * fontMono.style.fontFamily` from `src/app/fonts.ts`; a literal
 * "JetBrains Mono" does not match the self-hosted face).
 */

export type MonacoTokenRule = {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
};

export type MonacoThemeData = {
  base: "vs" | "vs-dark" | "hc-black" | "hc-light";
  inherit: boolean;
  rules: MonacoTokenRule[];
  colors: Record<string, string>;
};

export const MONACO_THEME_LIGHT = "leetcopy-light";
export const MONACO_THEME_DARK = "leetcopy-dark";
export type MonacoThemeName = typeof MONACO_THEME_LIGHT | typeof MONACO_THEME_DARK;

export const leetcopyLight: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "14213D" },
    { token: "comment", foreground: "5B6A82", fontStyle: "italic" },
    { token: "keyword", foreground: "1C46A3", fontStyle: "bold" },
    { token: "string", foreground: "0B6E5C" },
    { token: "string.escape", foreground: "8F5500" },
    { token: "number", foreground: "8F5500" },
    { token: "constant", foreground: "B5410E" },
    { token: "regexp", foreground: "B5410E" },
    { token: "type", foreground: "0E6577" },
    { token: "type.identifier", foreground: "0E6577" },
    { token: "identifier", foreground: "14213D" },
    { token: "delimiter", foreground: "3A4A66" },
    { token: "operator", foreground: "3A4A66" },
    { token: "tag", foreground: "1C46A3" },
    { token: "attribute.name", foreground: "8A2378" },
    { token: "predefined", foreground: "8A2378" },
  ],
  colors: {
    "editor.background": "#FBFCFE",
    "editor.foreground": "#14213D",
    "editorLineNumber.foreground": "#647189",
    "editorLineNumber.activeForeground": "#14213D",
    "editor.lineHighlightBackground": "#F3F7FD",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#2457C5",
    "editor.selectionBackground": "#C8DAF6",
    "editor.inactiveSelectionBackground": "#E4EDFB",
    "editor.selectionHighlightBackground": "#E4EDFB",
    "editor.wordHighlightBackground": "#E4EDFB",
    "editor.findMatchBackground": "#F5D48A",
    "editor.findMatchHighlightBackground": "#FBF1DF",
    "editorBracketMatch.background": "#E4EDFB",
    "editorBracketMatch.border": "#9DBCEE",
    "editorIndentGuide.background1": "#E6ECF4",
    "editorIndentGuide.activeBackground1": "#B7C5D9",
    "editorWhitespace.foreground": "#D9E2EE",
    "editorGutter.background": "#FBFCFE",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#D9E2EE",
    "editorSuggestWidget.background": "#FFFFFF",
    "editorSuggestWidget.border": "#D9E2EE",
    "editorSuggestWidget.selectedBackground": "#EAF1FC",
    "editorHoverWidget.background": "#FFFFFF",
    "editorHoverWidget.border": "#D9E2EE",
    "editorError.foreground": "#C42B3C",
    "editorWarning.foreground": "#975A00",
    "scrollbarSlider.background": "#B7C5D966",
    "scrollbarSlider.hoverBackground": "#8293AE80",
    "scrollbarSlider.activeBackground": "#8293AEAA",
    focusBorder: "#2457C5",
  },
};

export const leetcopyDark: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "E7EDF7" },
    { token: "comment", foreground: "8C9AB6", fontStyle: "italic" },
    { token: "keyword", foreground: "8DB4F5", fontStyle: "bold" },
    { token: "string", foreground: "4FCDB0" },
    { token: "string.escape", foreground: "E9B04F" },
    { token: "number", foreground: "E9B04F" },
    { token: "constant", foreground: "F49A6B" },
    { token: "regexp", foreground: "F49A6B" },
    { token: "type", foreground: "6FD3E8" },
    { token: "type.identifier", foreground: "6FD3E8" },
    { token: "identifier", foreground: "E7EDF7" },
    { token: "delimiter", foreground: "C3CEE2" },
    { token: "operator", foreground: "C3CEE2" },
    { token: "tag", foreground: "8DB4F5" },
    { token: "attribute.name", foreground: "E3A2EA" },
    { token: "predefined", foreground: "E3A2EA" },
  ],
  colors: {
    "editor.background": "#0F1A2E",
    "editor.foreground": "#E7EDF7",
    "editorLineNumber.foreground": "#7F8FAD",
    "editorLineNumber.activeForeground": "#E7EDF7",
    "editor.lineHighlightBackground": "#15223A",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#7AA3F2",
    "editor.selectionBackground": "#264272",
    "editor.inactiveSelectionBackground": "#1C2D4E",
    "editor.selectionHighlightBackground": "#1C2D4E",
    "editor.wordHighlightBackground": "#1C2D4E",
    "editor.findMatchBackground": "#6B4E12",
    "editor.findMatchHighlightBackground": "#33270F",
    "editorBracketMatch.background": "#1C2D4E",
    "editorBracketMatch.border": "#5B8DEF",
    "editorIndentGuide.background1": "#1F2D48",
    "editorIndentGuide.activeBackground1": "#3A4E73",
    "editorWhitespace.foreground": "#263755",
    "editorGutter.background": "#0F1A2E",
    "editorWidget.background": "#17243E",
    "editorWidget.border": "#263755",
    "editorSuggestWidget.background": "#17243E",
    "editorSuggestWidget.border": "#263755",
    "editorSuggestWidget.selectedBackground": "#1C2D4E",
    "editorHoverWidget.background": "#17243E",
    "editorHoverWidget.border": "#263755",
    "editorError.foreground": "#EE6D7B",
    "editorWarning.foreground": "#E9B04F",
    "scrollbarSlider.background": "#3A4E7366",
    "scrollbarSlider.hoverBackground": "#5A6E9280",
    "scrollbarSlider.activeBackground": "#5A6E92AA",
    focusBorder: "#7AA3F2",
  },
};

export const MONACO_THEMES: Record<MonacoThemeName, MonacoThemeData> = {
  [MONACO_THEME_LIGHT]: leetcopyLight,
  [MONACO_THEME_DARK]: leetcopyDark,
};

/** Theme name for next-themes' `resolvedTheme`. */
export function monacoThemeFor(resolvedTheme: string | undefined): MonacoThemeName {
  return resolvedTheme === "dark" ? MONACO_THEME_DARK : MONACO_THEME_LIGHT;
}

/** Shared editor options (merge `fontFamily` and per-language `tabSize`). */
export const MONACO_EDITOR_OPTIONS = {
  fontSize: 14,
  lineHeight: 22,
  fontLigatures: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 12 },
  renderLineHighlight: "line",
  automaticLayout: true,
  "bracketPairColorization.enabled": false,
} as const;

export const MONACO_TAB_SIZE = { python: 4, javascript: 2 } as const;
