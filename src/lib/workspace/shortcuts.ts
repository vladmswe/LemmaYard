// Editor keyboard shortcuts (AC-M5-1): Ctrl/Cmd+Enter = Run,
// Ctrl/Cmd+Shift+Enter = Submit, registered with `editor.addCommand`. Typed
// against the few Monaco members used, so it is testable without Monaco.

export type MonacoKeys = {
  KeyMod: { CtrlCmd: number; Shift: number };
  KeyCode: { Enter: number };
};

export type CommandEditor = {
  addCommand(keybinding: number, handler: () => void, context?: string): string | null;
};

export type ShortcutHandlers = { onRun: () => void; onSubmit: () => void };

export function runKeybinding(monaco: MonacoKeys): number {
  return monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
}

export function submitKeybinding(monaco: MonacoKeys): number {
  return monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter;
}

/**
 * Registers both commands. Handlers are read through the getter on every
 * press, so the latest callbacks run without re-registering.
 */
export function registerRunSubmitShortcuts(
  editor: CommandEditor,
  monaco: MonacoKeys,
  handlers: () => ShortcutHandlers,
): void {
  editor.addCommand(runKeybinding(monaco), () => handlers().onRun());
  editor.addCommand(submitKeybinding(monaco), () => handlers().onSubmit());
}

/** macOS / iOS show ⌘ instead of Ctrl. */
export function isApplePlatform(platform: string | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "");
}

/** Key caps for tooltips and hints: `["⌘", "Enter"]`, `["Ctrl", "Shift", "Enter"]`. */
export function shortcutKeys(action: "run" | "submit", apple: boolean): string[] {
  const mod = apple ? "⌘" : "Ctrl";
  return action === "run" ? [mod, "Enter"] : [mod, "Shift", "Enter"];
}
