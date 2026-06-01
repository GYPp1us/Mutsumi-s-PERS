import { create } from "zustand";
import type { Project, Settings, TemplateInfo, TemplateFile, GroupInfo } from "./tauri";
import * as api from "./tauri";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export type NavView = "home" | "templates";

export interface TreeItem {
  type: "project" | "group-header";
  id: string;
  project?: Project;
  groupId?: string;
  groupName?: string;
  groupColor?: string;
  groupCollapsed?: boolean;
  groupItemCount?: number;
  isGrouped?: boolean;
}

interface AppStore {
  projects: Project[];
  groups: GroupInfo[];
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
  loadGroups: () => Promise<void>;
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
  createGroup: (name: string, color: string) => Promise<string>;
  deleteGroup: (id: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  toggleGroup: (id: string, collapsed: boolean) => Promise<void>;
  moveToGroup: (projectId: string, groupId: string | null) => Promise<void>;
  reorderAll: (projectIds: string[]) => void;
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

export const GROUP_COLORS = [
  "#586878", "#5a6a5a", "#7a6a5a", "#5a5a7a",
  "#4a6a6a", "#6a5a6a", "#7a5a6a", "#5a5a5a",
];

let _colorIdx = 0;
export function nextGroupColor(): string {
  const c = GROUP_COLORS[_colorIdx % GROUP_COLORS.length];
  _colorIdx++;
  return c;
}

export function buildTree(projects: Project[], groups: GroupInfo[]): TreeItem[] {
  const result: TreeItem[] = [];
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  let lastGroupId: string | null = null;
  let groupStartIdx = -1;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const gid = p.group_id;

    if (gid && gid === lastGroupId) {
      continue;
    }

    if (gid && gid !== lastGroupId) {
      flushGroup();
    }

    if (gid) {
      lastGroupId = gid;
      groupStartIdx = result.length;
    } else {
      lastGroupId = null;
      result.push({ type: "project", id: p.id, project: p });
    }
  }
  flushGroup();

  function flushGroup() {
    if (lastGroupId === null || groupStartIdx === -1) return;
    const g = groupMap.get(lastGroupId);
    if (!g) {
      lastGroupId = null;
      groupStartIdx = -1;
      return;
    }
    const groupProjects = projects.filter((p) => p.group_id === lastGroupId);
    result.splice(groupStartIdx, 0, {
      type: "group-header",
      id: g.id,
      groupId: g.id,
      groupName: g.name,
      groupColor: g.color,
      groupCollapsed: g.collapsed,
      groupItemCount: groupProjects.length,
    });
    const insertedIdx = groupStartIdx + 1;
    let inserted = 0;
    for (const p of groupProjects) {
      result.splice(insertedIdx + inserted, 0, {
        type: "project",
        id: p.id,
        project: p,
        isGrouped: true,
        groupColor: g.color,
      });
      inserted++;
    }
    lastGroupId = null;
    groupStartIdx = -1;
  }

  return result;
}

export const useAppStore = create<AppStore>((set, get) => ({
  projects: [],
  groups: [],
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

  loadGroups: async () => {
    try {
      const groups = await api.listGroups();
      set({ groups });
    } catch (e) {
      console.error("Failed to load groups:", e);
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
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    });
  },

  toggleStar: async (id, starred) => {
    await api.updateProject(id, { starred });
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, starred } : p)) });
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

  createGroup: async (name, color) => {
    const group = await api.createGroup(name, color);
    set({ groups: [...get().groups, group] });
    return group.id;
  },
  deleteGroup: async (id) => {
    await api.deleteGroup(id);
    const st = get();
    set({
      groups: st.groups.filter((g) => g.id !== id),
      projects: st.projects.map((p) => p.group_id === id ? { ...p, group_id: null } : p),
    });
  },

  renameGroup: async (id, name) => {
    await api.renameGroup(id, name);
    set({ groups: get().groups.map((g) => g.id === id ? { ...g, name } : g) });
  },

  toggleGroup: async (id, collapsed) => {
    await api.toggleGroup(id, collapsed);
    set({ groups: get().groups.map((g) => g.id === id ? { ...g, collapsed } : g) });
  },

  moveToGroup: async (projectId, groupId) => {
    await api.setProjectGroup(projectId, groupId);
    set({ projects: get().projects.map((p) => p.id === projectId ? { ...p, group_id: groupId } : p) });
  },

  reorderAll: (projectIds) => {
    const projects = get().projects;
    const idSet = new Set(projectIds);
    const ordered = projectIds.map((id) => projects.find((p) => p.id === id)!).filter(Boolean);
    const remaining = projects.filter((p) => !idSet.has(p.id));
    set({ projects: [...ordered, ...remaining] });
    api.reorderAll(projectIds).catch((e) => console.error("Failed to persist order:", e));
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
    try { await api.setPinned(next); } catch {}
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
