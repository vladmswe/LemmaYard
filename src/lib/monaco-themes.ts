/**
 * Monaco editor themes (DESIGN.md §13.5, design v2 "Proof"). Plain data so this module needs no
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

export const MONACO_THEME_LIGHT = "lemmayard-light";
export const MONACO_THEME_DARK = "lemmayard-dark";
export type MonacoThemeName = typeof MONACO_THEME_LIGHT | typeof MONACO_THEME_DARK;

export const lemmayardLight: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "0A1433" },
    { token: "comment", foreground: "5F6B88", fontStyle: "italic" },
    { token: "keyword", foreground: "2340D8" },
    { token: "string", foreground: "13733A" },
    { token: "string.escape", foreground: "935700" },
    { token: "number", foreground: "935700" },
    { token: "constant", foreground: "935700" },
    { token: "regexp", foreground: "B03F0D" },
    { token: "type", foreground: "7B2AA8" },
    { token: "type.identifier", foreground: "7B2AA8" },
    { token: "identifier", foreground: "0A1433" },
    { token: "function", foreground: "16288F" },
    { token: "predefined", foreground: "16288F" },
    { token: "delimiter", foreground: "525E7B" },
    { token: "operator", foreground: "525E7B" },
    { token: "tag", foreground: "2340D8" },
    { token: "attribute.name", foreground: "7B2AA8" },
  ],
  colors: {
    "editor.background": "#FBFCFF",
    "editor.foreground": "#0A1433",
    "editorLineNumber.foreground": "#5F6B88",
    "editorLineNumber.activeForeground": "#0A1433",
    "editor.lineHighlightBackground": "#2340D80F",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#2340D8",
    "editor.selectionBackground": "#DCE5FF",
    "editor.inactiveSelectionBackground": "#E3E9FF",
    "editor.selectionHighlightBackground": "#E3E9FF",
    "editor.wordHighlightBackground": "#E3E9FF",
    "editor.findMatchBackground": "#F5D48A",
    "editor.findMatchHighlightBackground": "#FBF0DC",
    "editorBracketMatch.background": "#E3E9FF",
    "editorBracketMatch.border": "#2340D8",
    "editorIndentGuide.background1": "#D8DFEE",
    "editorIndentGuide.activeBackground1": "#AEBAD3",
    "editorWhitespace.foreground": "#D8DFEE",
    "editorGutter.background": "#FBFCFF",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#D8DFEE",
    "editorSuggestWidget.background": "#FFFFFF",
    "editorSuggestWidget.border": "#D8DFEE",
    "editorSuggestWidget.selectedBackground": "#EBEFF8",
    "editorHoverWidget.background": "#FFFFFF",
    "editorHoverWidget.border": "#D8DFEE",
    "editorError.foreground": "#C0283A",
    "editorWarning.foreground": "#935700",
    "scrollbarSlider.background": "#AEBAD366",
    "scrollbarSlider.hoverBackground": "#717FA080",
    "scrollbarSlider.activeBackground": "#717FA0AA",
    focusBorder: "#2340D8",
  },
};

export const lemmayardDark: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "EBF0FF" },
    { token: "comment", foreground: "8C9ABF", fontStyle: "italic" },
    { token: "keyword", foreground: "A9BEFF" },
    { token: "string", foreground: "74DCA0" },
    { token: "string.escape", foreground: "E8B04E" },
    { token: "number", foreground: "E8B04E" },
    { token: "constant", foreground: "E8B04E" },
    { token: "regexp", foreground: "F49C6E" },
    { token: "type", foreground: "E2A8FF" },
    { token: "type.identifier", foreground: "E2A8FF" },
    { token: "identifier", foreground: "EBF0FF" },
    { token: "function", foreground: "D4DEFF" },
    { token: "predefined", foreground: "D4DEFF" },
    { token: "delimiter", foreground: "9CA9CC" },
    { token: "operator", foreground: "9CA9CC" },
    { token: "tag", foreground: "A9BEFF" },
    { token: "attribute.name", foreground: "E2A8FF" },
  ],
  colors: {
    "editor.background": "#09112A",
    "editor.foreground": "#EBF0FF",
    "editorLineNumber.foreground": "#7F8DB3",
    "editorLineNumber.activeForeground": "#EBF0FF",
    "editor.lineHighlightBackground": "#8DA8FF14",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#A9BEFF",
    "editor.selectionBackground": "#1D2C66",
    "editor.inactiveSelectionBackground": "#18265A",
    "editor.selectionHighlightBackground": "#18265A",
    "editor.wordHighlightBackground": "#18265A",
    "editor.findMatchBackground": "#6B4E12",
    "editor.findMatchHighlightBackground": "#30250F",
    "editorBracketMatch.background": "#18265A",
    "editorBracketMatch.border": "#8DA8FF",
    "editorIndentGuide.background1": "#1F2C55",
    "editorIndentGuide.activeBackground1": "#34467A",
    "editorWhitespace.foreground": "#1F2C55",
    "editorGutter.background": "#09112A",
    "editorWidget.background": "#121D40",
    "editorWidget.border": "#1F2C55",
    "editorSuggestWidget.background": "#121D40",
    "editorSuggestWidget.border": "#1F2C55",
    "editorSuggestWidget.selectedBackground": "#18265A",
    "editorHoverWidget.background": "#121D40",
    "editorHoverWidget.border": "#1F2C55",
    "editorError.foreground": "#F27382",
    "editorWarning.foreground": "#E8B04E",
    "scrollbarSlider.background": "#34467A66",
    "scrollbarSlider.hoverBackground": "#6676A380",
    "scrollbarSlider.activeBackground": "#6676A3AA",
    focusBorder: "#A9BEFF",
  },
};

export const MONACO_THEMES: Record<MonacoThemeName, MonacoThemeData> = {
  [MONACO_THEME_LIGHT]: lemmayardLight,
  [MONACO_THEME_DARK]: lemmayardDark,
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
  renderLineHighlight: "all",
  automaticLayout: true,
  "bracketPairColorization.enabled": false,
} as const;

export const MONACO_TAB_SIZE = { python: 4, javascript: 2 } as const;
