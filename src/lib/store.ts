import { create } from "zustand";
import type { Project, Settings, TemplateInfo, TemplateFile } from "./tauri";
import * as api from "./tauri";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

type NavView = "home" | "templates";

interface AppStore {
  projects: Project[];
  settings: Settings | null;
  selectedProjectId: string | null;
  theme: "dark" | "light";
  locale: "zh" | "en";
  showSettings: boolean;
  showCreateProject: boolean;
  navView: NavView;
  templates: TemplateInfo[];
  toasts: Toast[];
  loadProjects: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  addProjectQuick: (name: string, path: string, templateName: string | null) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  toggleStar: (id: string, starred: boolean) => Promise<void>;
  selectProject: (id: string | null) => void;
  toggleTheme: () => void;
  setLocale: (locale: "zh" | "en") => void;
  toggleSettings: () => void;
  hideSettings: () => void;
  openCreateProject: () => void;
  closeCreateProject: () => void;
  setNavView: (view: NavView) => void;
  reorderProjects: (ids: string[]) => void;
  createTemplate: (name: string, description: string, files: TemplateFile[]) => Promise<void>;
  removeTemplate: (name: string) => Promise<void>;
  pinned: boolean;
  togglePin: () => void;
  setPinnedState: (pinned: boolean) => void;
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
  showCreateProject: false,
  navView: "home",
  templates: [],
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

  loadTemplates: async () => {
    try {
      const templates = await api.listTemplates();
      set({ templates });
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
  },

  addProject: async (name, path) => {
    const project = await api.addProject(name, path);
    set({
      projects: [...get().projects, project],
      selectedProjectId: project.id,
      navView: "home",
    });
  },

  addProjectQuick: async (name, path, templateName) => {
    const project = await api.createProject(name, path, templateName);
    set({
      projects: [...get().projects, project],
      selectedProjectId: project.id,
      showCreateProject: false,
      navView: "home",
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

  selectProject: (id) => {
    set({ selectedProjectId: id, navView: "home" });
  },

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
  openCreateProject: () => set({ showCreateProject: true }),
  closeCreateProject: () => set({ showCreateProject: false }),
  setNavView: (view) => set({ navView: view, selectedProjectId: null }),

  reorderProjects: (ids) => {
    const projects = get().projects;
    const idSet = new Set(ids);
    const ordered = ids.map((id) => projects.find((p) => p.id === id)!).filter(Boolean);
    const remaining = projects.filter((p) => !idSet.has(p.id));
    set({ projects: [...ordered, ...remaining] });
    api.reorderProjects(ids).catch((e) => console.error("Failed to persist order:", e));
  },

  createTemplate: async (name, description, files) => {
    await api.createTemplate(name, description, files);
    await get().loadTemplates();
  },

  removeTemplate: async (name) => {
    await api.removeTemplate(name);
    await get().loadTemplates();
  },

  togglePin: async () => {
    const next = !get().pinned;
    set({ pinned: next });
    try { await api.setPinned(next); } catch { /* ignore */ }
  },

  setPinnedState: (pinned) => {
    set({ pinned });
    api.setPinned(pinned).catch(() => {});
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
