import { vi } from "vitest";

const store: Record<string, string> = {};

vi.stubGlobal("localStorage", {
  getItem(key: string) { return store[key] ?? null; },
  setItem(key: string, value: string) { store[key] = value; },
  removeItem(key: string) { delete store[key]; },
  clear() { for (const k of Object.keys(store)) delete store[k]; },
});
