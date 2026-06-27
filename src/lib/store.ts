// ============================================================================
//
//   Zustand create<Type>((set, get) => ({ ... })):
//   Map<K, V> / Set<V>:
//
//
//
// ============================================================================

import { create } from "zustand";
import type { Project, Settings, TemplateInfo, TemplateFile, GroupInfo } from "./tauri";
import * as api from "./tauri";
import { log } from "./draglog";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export type NavView = "home" | "templates";

export interface TreeItem {
  type: "project" | "group-header" | "group-slot";

  id: string;

  project?: Project;
  isGrouped?: boolean;
  groupColor?: string;

  groupId?: string;
  groupName?: string;
  groupCollapsed?: boolean;
  groupItemCount?: number;
}

export const GROUP_COLORS = [
  "#586878", "#5a6a5a", "#7a6a5a", "#5a5a7a",
  "#4a6a6a", "#6a5a6a", "#7a5a6a", "#5a5a5a",
];

export function nextGroupColor(existingGroups: GroupInfo[]): string {
  const usedColors = new Set(existingGroups.map((group) => group.color));
  for (const color of GROUP_COLORS) {
    if (!usedColors.has(color)) return color;
  }
  return GROUP_COLORS[0];
}

// ===========================================================================
//
//
//   projects = [{id:"a", group_id:"G1"}, {id:"b", group_id:"G1"}, {id:"c", group_id:null}]
//
//   [
//     {type:"project",       id:"a",  project:{...}, isGrouped:true, groupColor:"#586878"},
//     {type:"project",       id:"b",  project:{...}, isGrouped:true, groupColor:"#586878"},
//
export function buildTree(projects: Project[], groups: GroupInfo[]): TreeItem[] {
  const result: TreeItem[] = [];
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  let currentGroupId: string | null = null;
  let pendingGroupProjects: Project[] = [];

  function flushGroup() {
    if (currentGroupId === null || pendingGroupProjects.length === 0) return;

    const group = groupMap.get(currentGroupId);
    if (!group) {
      for (const project of pendingGroupProjects) {
        result.push({ type: "project", id: project.id, project });
      }
    } else {
      result.push({
        type: "group-header",
        id: group.id,
        groupId: group.id,
        groupName: group.name,
        groupColor: group.color,
        groupCollapsed: group.collapsed,
        groupItemCount: pendingGroupProjects.length,
      });

      for (const project of pendingGroupProjects) {
        result.push({
          type: "project",
          id: project.id,
          project,
          isGrouped: true,
          groupColor: group.color,
        });
      }
    }

    currentGroupId = null;
    pendingGroupProjects = [];
  }

  for (const project of projects) {
    const groupId = project.group_id || null;

    if (groupId !== currentGroupId) {
      flushGroup();
      currentGroupId = groupId;
    }

    if (groupId) {
      pendingGroupProjects.push(project);
    } else {
      result.push({ type: "project", id: project.id, project });
    }
  }

  flushGroup();
  return result;
}

// ===========================================================================
//
// ============================================================================
export function computeFinalOrder(flatTree: TreeItem[], projects: Project[]): string[] {
  const ids: string[] = [];
  const mapped = new Set<string>();

  for (const item of flatTree) {
    if (item.type !== "project" || mapped.has(item.id)) continue;
    ids.push(item.id);
    mapped.add(item.id);
  }

  for (const project of projects) {
    if (!mapped.has(project.id)) ids.push(project.id);
  }

  return ids;
}

// ===========================================================================
//
export function findEnclosingGroup(flatTree: TreeItem[], fromIndex: number): string | null {
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    const item = flatTree[index];
    if (item.type !== "group-header") continue;

    const groupId = item.groupId ?? null;
    if (!groupId) return null;

    for (let scan = index + 1; scan < flatTree.length; scan += 1) {
      const scanned = flatTree[scan];
      if (scanned.type === "group-header") break;
      if (scan === fromIndex) return groupId;
      if (scanned.type === "project" && scanned.project?.group_id !== groupId) break;
      if (scanned.type === "group-slot" && scanned.groupId !== groupId) break;
    }

    return null;
  }
  return null;
}

// ===========================================================================
//
export function normalizeGroupOrder(projects: Project[]): Project[] {
  const order: Project[] = [];
  const seen = new Set<string>();

  for (const project of projects) {
    if (seen.has(project.id)) continue;

    if (!project.group_id) {
      order.push(project);
      seen.add(project.id);
      continue;
    }

    const groupId = project.group_id;
    for (const groupedProject of projects) {
      if (groupedProject.group_id !== groupId || seen.has(groupedProject.id)) continue;
      order.push(groupedProject);
      seen.add(groupedProject.id);
    }
  }

  for (const project of projects) {
    if (!seen.has(project.id)) order.push(project);
  }

  return order;
}

export function pruneEmptyGroups(projects: Project[], groups: GroupInfo[]): GroupInfo[] {
  const usedGroupIds = new Set(
    projects
      .map((project) => project.group_id)
      .filter((groupId): groupId is string => !!groupId)
  );
  return groups.filter((group) => usedGroupIds.has(group.id));
}

// ===========================================================================
// create<AppStore>((set, get) => ({ ... }))
//
// ============================================================================
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
      set({ projects: normalizeGroupOrder(projects) });
    } catch (e) { console.error("Failed to load projects:", e); }
  },

  loadGroups: async () => {
    try { const groups = await api.listGroups(); set({ groups }); }
    catch (e) { console.error("Failed to load groups:", e); }
  },

  loadSettings: async () => {
    try { const settings = await api.getSettings(); set({ settings }); }
    catch (e) { console.error("Failed to load settings:", e); }
  },

  loadTemplates: async () => {
    try { const templates = await api.listTemplates(); set({ templates }); }
    catch (e) { console.error("Failed to load templates:", e); }
  },

  addProject: async (name, path) => {
    const project = await api.addProject(name, path);
    set({ projects: [...get().projects, project], selectedProjectId: project.id, navView: "home" });
  },

  addProjectQuick: async (name, path, templateName) => {
    const project = await api.createProject(name, path, templateName);
    set({ projects: [...get().projects, project], selectedProjectId: project.id, showCreateProject: false, navView: "home" });
  },

  removeProject: async (id) => {
    await api.removeProject(id);
    const state = get();
    set({ projects: state.projects.filter((p) => p.id !== id), selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId });
  },

  toggleStar: async (id, starred) => {
    await api.updateProject(id, { starred });
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, starred } : p)) });
  },

  selectProject: (id) => set({ selectedProjectId: id, navView: "home" }),

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("mutsumi-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },
  setLocale: (locale) => { localStorage.setItem("mutsumi-locale", locale); set({ locale }); },
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
    set({ groups: st.groups.filter((g) => g.id !== id), projects: st.projects.map((p) => p.group_id === id ? { ...p, group_id: null } : p) });
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

  // =========================================================================
  //
  // =========================================================================
  reorderAll: async (projectIds) => {
    const prevProjects = [...get().projects];
    const idSet = new Set(projectIds);
    const ordered = projectIds.map((id) => prevProjects.find((p) => p.id === id)!).filter(Boolean);
    const remaining = prevProjects.filter((p) => !idSet.has(p.id));
    set({ projects: [...ordered, ...remaining] });

    try {
      await api.reorderAll([...ordered, ...remaining].map((p) => p.id));
      log.api("REORDER", { order: [...ordered, ...remaining].map((p) => p.id) }, true);
    } catch (e) {
      set({ projects: prevProjects });
      log.api("ERROR", { error: String(e) }, false);
      log.rollback(String(e), prevProjects);
      console.error("Failed to persist order:", e);
    }
  },

  // =========================================================================
  //
  // groupChanges: [{projectId: "a", groupId: "G1"}, ...]
  //
  batchMoveAndReorder: async (groupChanges, finalOrder) => {
    const prevProjects = [...get().projects];
    const changes = new Map(groupChanges.map((c) => [c.projectId, c.groupId]));

    const updated = prevProjects.map((p) =>
      changes.has(p.id) ? { ...p, group_id: changes.get(p.id)! } : p
    );

    const idSet = new Set(finalOrder);
    const ordered = finalOrder.map((id) => updated.find((p) => p.id === id)!).filter(Boolean);
    const remaining = updated.filter((p) => !idSet.has(p.id));
    const finalProjects = normalizeGroupOrder([...ordered, ...remaining]);
    const prevGroups = [...get().groups];
    const finalGroups = pruneEmptyGroups(finalProjects, prevGroups);
    const removedGroups = prevGroups.filter((group) => !finalGroups.some((next) => next.id === group.id));

    log.normalize([...ordered, ...remaining], finalProjects);
    set({ projects: finalProjects, groups: finalGroups });

    try {
      for (const { projectId, groupId } of groupChanges) {
        await api.setProjectGroup(projectId, groupId);
        log.api("SET_GROUP", { projectId, groupId }, true);
      }
      for (const group of removedGroups) {
        await api.deleteGroup(group.id);
        log.api("DELETE_GROUP", { groupId: group.id }, true);
      }
      await api.reorderAll(finalProjects.map((p) => p.id));
      log.api("REORDER", { order: finalProjects.map((p) => p.id) }, true);
    } catch (e) {
      set({ projects: prevProjects, groups: prevGroups });
      log.api("ERROR", { error: String(e) }, false);
      log.rollback(String(e), prevProjects);
      console.error("batchMoveAndReorder: rollback", e);
    }
  },

  createTemplate: async (name, description, files) => { await api.createTemplate(name, description, files); await get().loadTemplates(); },
  removeTemplate: async (name) => { await api.removeTemplate(name); await get().loadTemplates(); },

  togglePin: async () => { const next = !get().pinned; set({ pinned: next }); try { await api.setPinned(next); } catch { /* ignore */ } },
  setPinnedState: (pinned) => { set({ pinned }); api.setPinned(pinned).catch(() => {}); },
  setUpdateAvailable: (update) => set({ updateAvailable: update }),
  setUpdateProgress: (progress) => set({ updateProgress: progress }),
  setUpdateStatus: (status) => set({ updateStatus: status }),

  addToast: (message, type) => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, type }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3000);
  },
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

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
  pinned: boolean;
  updateAvailable: { version: string; body?: string } | null;
  updateProgress: { downloaded: number; total: number } | null;
  updateStatus: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
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
  batchMoveAndReorder: (groupChanges: { projectId: string; groupId: string | null }[], finalOrder: string[]) => Promise<void>;
  createTemplate: (name: string, description: string, files: TemplateFile[]) => Promise<void>;
  removeTemplate: (name: string) => Promise<void>;
  togglePin: () => void;
  setPinnedState: (pinned: boolean) => void;
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
  setUpdateAvailable: (update: { version: string; body?: string } | null) => void;
  setUpdateProgress: (progress: { downloaded: number; total: number } | null) => void;
  setUpdateStatus: (status: "idle" | "checking" | "available" | "downloading" | "ready" | "error") => void;
}

