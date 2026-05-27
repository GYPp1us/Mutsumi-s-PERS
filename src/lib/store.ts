import { create } from "zustand";
import type { Project, Settings } from "./tauri";
import * as api from "./tauri";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface AppStore {
  projects: Project[];
  settings: Settings | null;
  selectedProjectId: string | null;
  theme: "dark" | "light";
  locale: "zh" | "en";
  showSettings: boolean;
  toasts: Toast[];
  loadProjects: () => Promise<void>;
  loadSettings: () => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  toggleStar: (id: string, starred: boolean) => Promise<void>;
  selectProject: (id: string | null) => void;
  toggleTheme: () => void;
  setLocale: (locale: "zh" | "en") => void;
  toggleSettings: () => void;
  hideSettings: () => void;
  pinned: boolean;
  togglePin: () => void;
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
  updateAvailable: { version: string; body?: string } | null;
  updateProgress: { downloaded: number; total: number } | null;
  updateStatus: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  setUpdateAvailable: (update: { version: string; body?: string } | null) => void;
  setUpdateProgress: (progress: { downloaded: number; total: number } | null) => void;
  setUpdateStatus: (status: "idle" | "checking" | "available" | "downloading" | "ready" | "error") => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projects: [],
  settings: null,
  selectedProjectId: null,
  theme: (localStorage.getItem("mutsumi-theme") as "dark" | "light") || "dark",
  locale: (localStorage.getItem("mutsumi-locale") as "zh" | "en") || "en",
  showSettings: false,
  toasts: [],
  pinned: true,
  updateAvailable: null,
  updateProgress: null,
  updateStatus: "idle",

  loadProjects: async () => {
    try {
      const projects = await api.listProjects();
      set({ projects });
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings });
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  addProject: async (name, path) => {
    const project = await api.addProject(name, path);
    set({
      projects: [...get().projects, project],
      selectedProjectId: project.id,
    });
  },

  removeProject: async (id) => {
    await api.removeProject(id);
    const state = get();
    set({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId:
        state.selectedProjectId === id ? null : state.selectedProjectId,
    });
  },

  toggleStar: async (id, starred) => {
    await api.updateProject(id, { starred });
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, starred } : p
      ),
    });
  },

  selectProject: (id) => set({ selectedProjectId: id }),

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("mutsumi-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },

  setLocale: (locale) => {
    localStorage.setItem("mutsumi-locale", locale);
    set({ locale });
  },

  toggleSettings: () => set({ showSettings: !get().showSettings }),
  hideSettings: () => set({ showSettings: false }),

  togglePin: async () => {
    const next = !get().pinned;
    set({ pinned: next });
    try { await api.setPinned(next); } catch { /* ignore */ }
  },

  setUpdateAvailable: (update) => set({ updateAvailable: update }),
  setUpdateProgress: (progress) => set({ updateProgress: progress }),
  setUpdateStatus: (status) => set({ updateStatus: status }),

  addToast: (message, type) => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, type }] });
    setTimeout(() => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    }, 3000);
  },
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
