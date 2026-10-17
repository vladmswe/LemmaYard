// Drafts, remembered language and pending submission in browser storage
// (AC-M5-2, AC-M5-6): versioned keys, round trips, and failure handling.
import { describe, expect, it } from "vitest";

import {
  clearDraft,
  clearPending,
  draftKey,
  getBrowserStorage,
  languageKey,
  loadDraft,
  loadLanguage,
  loadPending,
  pendingKey,
  saveDraft,
  saveLanguage,
  savePending,
  type KeyValueStorage,
} from "@/lib/workspace/storage";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const ID = "0b0e1c1a-2f6e-4a8b-9d3c-5e7f9a1b2c3d";

describe("keys", () => {
  it("are versioned and scoped by slug and language", () => {
    expect(draftKey("two-sum", "python")).toBe("lemmayard.draft.v1:two-sum:python");
    expect(draftKey("two-sum", "javascript")).toBe("lemmayard.draft.v1:two-sum:javascript");
    expect(languageKey("two-sum")).toBe("lemmayard.language.v1:two-sum");
    expect(pendingKey("two-sum")).toBe("lemmayard.pending.v1:two-sum");
  });
});

describe("drafts", () => {
  it("round-trips per (slug, language)", () => {
    const s = memoryStorage();
    expect(saveDraft(s, "two-sum", "python", "print(1)", 5)).toBe(true);
    expect(loadDraft(s, "two-sum", "python")).toBe("print(1)");
    expect(loadDraft(s, "two-sum", "javascript")).toBeNull();
    expect(loadDraft(s, "fizz-buzz", "python")).toBeNull();
    expect(JSON.parse(s.data.get(draftKey("two-sum", "python"))!)).toEqual({ code: "print(1)", savedAt: 5 });
  });

  it("keeps an empty draft (the user deleted everything)", () => {
    const s = memoryStorage();
    saveDraft(s, "two-sum", "python", "");
    expect(loadDraft(s, "two-sum", "python")).toBe("");
  });

  it("ignores corrupt or foreign values", () => {
    const s = memoryStorage();
    s.data.set(draftKey("a", "python"), "not json");
    s.data.set(draftKey("b", "python"), JSON.stringify({ code: 42 }));
    s.data.set(draftKey("c", "python"), "null");
    expect(loadDraft(s, "a", "python")).toBeNull();
    expect(loadDraft(s, "b", "python")).toBeNull();
    expect(loadDraft(s, "c", "python")).toBeNull();
  });

  it("clears", () => {
    const s = memoryStorage();
    saveDraft(s, "two-sum", "python", "x");
    clearDraft(s, "two-sum", "python");
    expect(loadDraft(s, "two-sum", "python")).toBeNull();
  });

  it("never throws when storage is missing or failing", () => {
    expect(saveDraft(null, "a", "python", "x")).toBe(false);
    expect(loadDraft(null, "a", "python")).toBeNull();
    expect(saveDraft(throwing, "a", "python", "x")).toBe(false);
    expect(loadDraft(throwing, "a", "python")).toBeNull();
    expect(() => clearDraft(throwing, "a", "python")).not.toThrow();
  });

  it("has no browser storage outside the browser", () => {
    expect(getBrowserStorage("local")).toBeNull();
    expect(getBrowserStorage("session")).toBeNull();
  });
});

describe("remembered language", () => {
  it("round-trips and rejects unknown values", () => {
    const s = memoryStorage();
    expect(loadLanguage(s, "two-sum")).toBeNull();
    saveLanguage(s, "two-sum", "javascript");
    expect(loadLanguage(s, "two-sum")).toBe("javascript");
    s.data.set(languageKey("x"), "cobol");
    expect(loadLanguage(s, "x")).toBeNull();
    expect(loadLanguage(throwing, "two-sum")).toBeNull();
    expect(() => saveLanguage(throwing, "two-sum", "python")).not.toThrow();
  });
});

describe("pending submission", () => {
  it("round-trips", () => {
    const s = memoryStorage();
    savePending(s, "two-sum", { id: ID, kind: "submit", custom: false });
    expect(loadPending(s, "two-sum")).toEqual({ id: ID, kind: "submit", custom: false });
    savePending(s, "two-sum", { id: ID, kind: "run", custom: true });
    expect(loadPending(s, "two-sum")).toEqual({ id: ID, kind: "run", custom: true });
    clearPending(s, "two-sum");
    expect(loadPending(s, "two-sum")).toBeNull();
  });

  it("rejects malformed entries (no polling of arbitrary paths)", () => {
    const s = memoryStorage();
    for (const bad of [
      "garbage",
      JSON.stringify({ id: "../../api/auth/logout", kind: "run" }),
      JSON.stringify({ id: ID, kind: "other" }),
      JSON.stringify({ kind: "run" }),
    ]) {
      s.data.set(pendingKey("p"), bad);
      expect(loadPending(s, "p")).toBeNull();
    }
    expect(loadPending(throwing, "p")).toBeNull();
    expect(() => savePending(throwing, "p", { id: ID, kind: "run", custom: false })).not.toThrow();
    expect(() => clearPending(throwing, "p")).not.toThrow();
  });
});
