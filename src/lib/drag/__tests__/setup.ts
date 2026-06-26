import { vi } from "vitest";

// 模拟 localStorage（Zustand store 初始化时用到）
vi.stubGlobal("localStorage", {
  _data: {} as Record<string, string>,
  getItem(key: string) { return this._data[key] ?? null; },
  setItem(key: string, value: string) { this._data[key] = value; },
  removeItem(key: string) { delete this._data[key]; },
  clear() { this._data = {}; },
});
