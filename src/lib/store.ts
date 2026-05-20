import { create } from "zustand";
import type { Project, Settings } from "./tauri";
import * as api from "./tauri";

interface AppStore {
  projects: Project[];
  settings: Settings | null;
  selectedProjectId: string | null;
  theme: "dark" | "light";
  locale: "zh" | "en";
  showSettings: boolean;
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
}

export const useAppStore = create<AppStore>((set, get) => ({
  projects: [],
  settings: null,
  selectedProjectId: null,
  theme: (localStorage.getItem("mutsumi-theme") as "dark" | "light") || "dark",
  locale: (localStorage.getItem("mutsumi-locale") as "zh" | "en") || "en",
  showSettings: false,

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
}));
