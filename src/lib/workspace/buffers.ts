// Per-language code buffers of the editor (AC-M5-1, AC-M5-2). Switching the
// language never touches the other language's code; Reset restores only the
// current language's starter template.
import { LANGUAGES, type Language } from "@/lib/submission-dto";

export type Buffers = Record<Language, string>;

export type BufferState = {
  language: Language;
  /** Current code per language. */
  buffers: Buffers;
  /** Generated starter code per language (Reset target). */
  templates: Buffers;
};

export type BufferAction =
  | { type: "select"; language: Language }
  | { type: "edit"; code: string }
  | { type: "reset" };

export const DEFAULT_LANGUAGE: Language = "python";

/**
 * Initial state: each language starts from its saved draft, else from its
 * template; the language is the remembered one when the problem offers it
 * (`available`), else Python.
 */
export function initBuffers(
  templates: Buffers,
  drafts: Partial<Record<Language, string | null>>,
  language: Language | null,
  available: readonly Language[] = LANGUAGES,
): BufferState {
  return {
    language: language !== null && available.includes(language) ? language : DEFAULT_LANGUAGE,
    templates,
    buffers: {
      python: drafts.python ?? templates.python,
      javascript: drafts.javascript ?? templates.javascript,
      java: drafts.java ?? templates.java,
    },
  };
}

export function buffersReducer(state: BufferState, action: BufferAction): BufferState {
  switch (action.type) {
    case "select":
      return action.language === state.language ? state : { ...state, language: action.language };
    case "edit":
      if (state.buffers[state.language] === action.code) return state;
      return { ...state, buffers: { ...state.buffers, [state.language]: action.code } };
    case "reset":
      return {
        ...state,
        buffers: { ...state.buffers, [state.language]: state.templates[state.language] },
      };
  }
}

/** Current language's code. */
export function currentCode(state: BufferState): string {
  return state.buffers[state.language];
}

/** True when the current language's code differs from its template. */
export function isModified(state: BufferState): boolean {
  return state.buffers[state.language] !== state.templates[state.language];
}
