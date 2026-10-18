// Per-language code buffers (AC-M5-1, AC-M5-2).
import { describe, expect, it } from "vitest";

import { buffersReducer, currentCode, initBuffers, isModified } from "@/lib/workspace/buffers";
import { generateTemplate } from "@/lib/templates";
import { shortcutKeys, isApplePlatform, registerRunSubmitShortcuts, runKeybinding, submitKeybinding } from "@/lib/workspace/shortcuts";

const signature = {
  name: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returns: "int[]",
};
const templates = {
  python: generateTemplate(signature, "python"),
  javascript: generateTemplate(signature, "javascript"),
  java: generateTemplate(signature, "java"),
};

describe("initBuffers", () => {
  it("restores a remembered Java draft and language when the problem offers Java", () => {
    const s = initBuffers(templates, { java: "class Solution {}" }, "java", ["python", "javascript", "java"]);
    expect(s.language).toBe("java");
    expect(currentCode(s)).toBe("class Solution {}");
  });

  it("falls back to Python when the remembered language is not offered by the problem", () => {
    const s = initBuffers(templates, { java: "class Solution {}" }, "java", ["python", "javascript"]);
    expect(s.language).toBe("python");
    // The Java draft is kept for when the problem gets a Java solution.
    expect(s.buffers.java).toBe("class Solution {}");
  });

  it("starts from templates and Python", () => {
    const s = initBuffers(templates, {}, null);
    expect(s.language).toBe("python");
    expect(s.buffers).toEqual(templates);
    expect(currentCode(s)).toContain("class Solution:");
    expect(isModified(s)).toBe(false);
  });

  it("restores drafts and the remembered language", () => {
    const s = initBuffers(templates, { javascript: "var twoSum = () => [0, 1];", python: null }, "javascript");
    expect(s.language).toBe("javascript");
    expect(currentCode(s)).toBe("var twoSum = () => [0, 1];");
    expect(s.buffers.python).toBe(templates.python);
  });

  it("keeps an empty draft instead of the template", () => {
    expect(initBuffers(templates, { python: "" }, null).buffers.python).toBe("");
  });
});

describe("buffersReducer", () => {
  it("switching languages back and forth never loses code", () => {
    let s = initBuffers(templates, {}, null);
    s = buffersReducer(s, { type: "edit", code: "py code" });
    s = buffersReducer(s, { type: "select", language: "javascript" });
    expect(currentCode(s)).toBe(templates.javascript);
    s = buffersReducer(s, { type: "edit", code: "js code" });
    s = buffersReducer(s, { type: "select", language: "python" });
    expect(currentCode(s)).toBe("py code");
    s = buffersReducer(s, { type: "select", language: "javascript" });
    expect(currentCode(s)).toBe("js code");
  });

  it("reset restores only the current language's template", () => {
    let s = initBuffers(templates, { python: "py", javascript: "js" }, "python");
    expect(isModified(s)).toBe(true);
    s = buffersReducer(s, { type: "reset" });
    expect(currentCode(s)).toBe(templates.python);
    expect(s.buffers.javascript).toBe("js");
    expect(isModified(s)).toBe(false);
  });

  it("returns the same state for no-op actions", () => {
    const s = initBuffers(templates, {}, null);
    expect(buffersReducer(s, { type: "select", language: "python" })).toBe(s);
    expect(buffersReducer(s, { type: "edit", code: templates.python })).toBe(s);
  });
});

describe("shortcuts", () => {
  const monaco = { KeyMod: { CtrlCmd: 2048, Shift: 1024 }, KeyCode: { Enter: 3 } };

  it("registers Ctrl/Cmd+Enter = Run and Ctrl/Cmd+Shift+Enter = Submit via addCommand", () => {
    const commands = new Map<number, () => void>();
    const editor = {
      addCommand: (key: number, handler: () => void) => {
        commands.set(key, handler);
        return String(key);
      },
    };
    const calls: string[] = [];
    let handlers = { onRun: () => calls.push("run"), onSubmit: () => calls.push("submit") };
    registerRunSubmitShortcuts(editor, monaco, () => handlers);

    expect([...commands.keys()].sort()).toEqual([runKeybinding(monaco), submitKeybinding(monaco)].sort());
    expect(runKeybinding(monaco)).toBe(2048 | 3);
    expect(submitKeybinding(monaco)).toBe(2048 | 1024 | 3);

    commands.get(runKeybinding(monaco))!();
    commands.get(submitKeybinding(monaco))!();
    // The latest handlers run without re-registering.
    handlers = { onRun: () => calls.push("run2"), onSubmit: () => calls.push("submit2") };
    commands.get(runKeybinding(monaco))!();
    expect(calls).toEqual(["run", "submit", "run2"]);
  });

  it("shows ⌘ on Apple platforms and Ctrl elsewhere", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform(undefined)).toBe(false);
    expect(shortcutKeys("run", true)).toEqual(["⌘", "Enter"]);
    expect(shortcutKeys("submit", false)).toEqual(["Ctrl", "Shift", "Enter"]);
  });
});
