// ============================================================================
// 文件 2/10: src/lib/store.ts — 阅读顺序第 2 位
// 作用: Zustand 全局状态容器 + TreeItem 类型 + 树构建/排序工具函数
//
// 新增 TS 语法:
//   Zustand create<Type>((set, get) => ({ ... })):
//     类似一个全局单例对象。set() 修改字段，get() 读取当前快照。
//     外部通过 useAppStore(s => s.xxx) 订阅某个字段的变化。
//
//   Map<K, V> / Set<V>:
//     类似 std::unordered_map / std::unordered_set 或 Python dict/set
//
//   x?.y:  可选链，等价于 x != null ? x.y : undefined
//   x!.y:  非空断言，告诉编译器"这里绝对不是 null"
//   ?? :   空值合并，a ?? b 等价于 a !== null && a !== undefined ? a : b
//
//   ...spread: 展开运算符
//     [...arr, item]  = 新数组 = 旧数组 + item
//     { ...obj, field: newVal } = 新对象 = 复制 obj 并覆盖 field
//
//   泛型 <T>:  类型参数，类似 C++ template<typename T>
// ============================================================================

import { create } from "zustand";
import type { Project, Settings, TemplateInfo, TemplateFile, GroupInfo } from "./tauri";
import * as api from "./tauri";  // import * as = 命名空间导入，api.listProjects() 这样用
import { log } from "./draglog";

// ─── 杂项类型 ───
export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export type NavView = "home" | "templates";

// ─── TreeItem: 渲染侧边栏列表的节点类型 ───
// "联合类型": 一个 TreeItem 可以是三种形态之一
// type 字段是判别符（discriminant），类似 tagged union
export interface TreeItem {
  type: "project" | "group-header" | "group-slot";  // 三种节点

  // 通用字段（所有 type 都有）
  id: string;

  // 只有 type === "project" 时才有 project 字段
  project?: Project;
  isGrouped?: boolean;   // 是否缩进显示（属于某分组）
  groupColor?: string;   // 分组颜色（缩进左边框用）

  // 只有 type === "group-header" 或 "group-slot" 时才有以下字段
  groupId?: string;
  groupName?: string;
  groupCollapsed?: boolean;
  groupItemCount?: number;
}

// ─── 分组颜色预设（8 种低饱和度色） ───
export const GROUP_COLORS = [
  "#586878", "#5a6a5a", "#7a6a5a", "#5a5a7a",
  "#4a6a6a", "#6a5a6a", "#7a5a6a", "#5a5a5a",
];

// nextGroupColor: 从未被使用的颜色中选一个
export function nextGroupColor(existingGroups: GroupInfo[]): string {
  const usedColors = new Set(existingGroups.map((g) => g.color));
  for (const c of GROUP_COLORS) {
    if (!usedColors.has(c)) return c;
  }
  return GROUP_COLORS[0];  // 全都用过就轮回第一个
}

// ===========================================================================
// buildTree(projects, groups) → TreeItem[]
//
// 核心算法: 将平铺的 Project[] 转换为可渲染的 TreeItem[] 列表
//
// 输入:
//   projects = [{id:"a", group_id:"G1"}, {id:"b", group_id:"G1"}, {id:"c", group_id:null}]
//   groups   = [{id:"G1", name:"我的组", color:"#586878", collapsed:false}]
//
// 输出:
//   [
//     {type:"group-header",  id:"G1", groupName:"我的组", groupColor:"#586878"},
//     {type:"project",       id:"a",  project:{...}, isGrouped:true, groupColor:"#586878"},
//     {type:"project",       id:"b",  project:{...}, isGrouped:true, groupColor:"#586878"},
//     {type:"project",       id:"c",  project:{...}},                     // 无分组
//   ]
//
// 逻辑: 遍历 projects，遇到相同 group_id 的连续项目就归入一个 group-header 块
// ============================================================================
export function buildTree(projects: Project[], groups: GroupInfo[]): TreeItem[] {
  const result: TreeItem[] = [];
  const groupMap = new Map(groups.map((g) => [g.id, g])); // {id → GroupInfo} 快速查找
  let currentGroupId: string | null = null;   // 当前正在积累的分组
  let pendingGroupProjects: Project[] = [];   // 当前分组中待输出的项目

  // flushGroup: 将 pending 中的项目包装成 group-header + project 块输出
  function flushGroup() {
    if (currentGroupId === null || pendingGroupProjects.length === 0) return;
    const g = groupMap.get(currentGroupId);
    if (!g) {
      // 分组不存在了 → 项目按无分组处理
      for (const p of pendingGroupProjects) {
        result.push({ type: "project", id: p.id, project: p });
      }
    } else {
      // 输出分组头
      result.push({
        type: "group-header",
        id: g.id,
        groupId: g.id,
        groupName: g.name,
        groupColor: g.color,
        groupCollapsed: g.collapsed,
        groupItemCount: pendingGroupProjects.length,
      });
      // 输出分组内的项目（带 isGrouped 标记）
      for (const p of pendingGroupProjects) {
        result.push({
          type: "project",
          id: p.id,
          project: p,
          isGrouped: true,
          groupColor: g.color,
        });
      }
    }
    currentGroupId = null;
    pendingGroupProjects = [];
  }

  for (const p of projects) {
    const gid = p.group_id || null;

    // group_id 变化 → 先输出上一个分组
    if (gid !== currentGroupId) {
      flushGroup();
      currentGroupId = gid;
    }

    if (gid) {
      pendingGroupProjects.push(p);  // 积累到当前分组
    } else {
      result.push({ type: "project", id: p.id, project: p });  // 无分组直接输出
    }
  }
  flushGroup();  // 输出最后一个分组

  return result;
}

// ===========================================================================
// computeFinalOrder(flatTree, projects) → string[]
//
// 从 TreeItem[] 反推 Project[] 的顺序（丢弃 group-header 和 group-slot）
// 返回排序后的项目 ID 列表，用于传给 Rust 后端的 reorder_projects
// ============================================================================
export function computeFinalOrder(flatTree: TreeItem[], projects: Project[]): string[] {
  const ids: string[] = [];
  const mapped = new Set<string>();          // 已处理的项目 ID

  for (const it of flatTree) {
    if (it.type === "group-slot") continue;  // 幽灵槽位跳过

    if (it.type === "project" && !mapped.has(it.id)) {
      ids.push(it.id);
      mapped.add(it.id);
    } else if (it.type === "group-header" && it.groupId) {
      // 分组头 → 按原始数据中的顺序输出该分组下的所有项目
      const gprojs = projects
        .filter((p) => p.group_id === it.groupId)
        .map((p) => p.id);
      for (const pid of gprojs) {
        if (!mapped.has(pid)) { ids.push(pid); mapped.add(pid); }
      }
    }
  }

  // 补充 flatTree 中没有覆盖到的项目（防御性，理论上不应发生）
  for (const p of projects) {
    if (!mapped.has(p.id)) ids.push(p.id);
  }
  return ids;
}

// ===========================================================================
// findEnclosingGroup(flatTree, fromIndex) → groupId | null
//
// 从 fromIndex 位置向前扫描，找到包裹它的分组头
// 用于判断一个项目在拖拽后是否仍属于原分组
// ============================================================================
export function findEnclosingGroup(flatTree: TreeItem[], fromIndex: number): string | null {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (flatTree[i].type === "group-header") return flatTree[i].groupId!;
  }
  return null;
}

// ===========================================================================
// normalizeGroupOrder(projects) → Project[]
//
// 确保同 group_id 的项目在数组中是连续的。
// 用于修复多次操作后可能出现的不连续情况。
// ============================================================================
export function normalizeGroupOrder(projects: Project[]): Project[] {
  const order: Project[] = [];
  const seen = new Set<string>();

  for (const p of projects) {
    if (seen.has(p.id)) continue;         // 已输出过
    if (!p.group_id) {
      order.push(p);
      seen.add(p.id);
    } else {
      const gid = p.group_id;
      // 找到所有同组的项目，按原顺序连续输出
      for (const gp of projects) {
        if (gp.group_id === gid && !seen.has(gp.id)) {
          order.push(gp);
          seen.add(gp.id);
        }
      }
    }
  }

  // 补充遗漏的
  for (const p of projects) {
    if (!seen.has(p.id)) order.push(p);
  }
  return order;
}

// ===========================================================================
// Zustand Store: 全局状态容器
//
// create<AppStore>((set, get) => ({ ... }))
//   set({ field: value })  → 合并式更新（只改指定字段，其他不变）
//   get()                  → 获取当前完整快照
//
// 外部用法:
//   const projects = useAppStore(s => s.projects);   // 订阅 projects
//   const add = useAppStore(s => s.addProject);       // 取 action（稳定引用）
// ============================================================================
export const useAppStore = create<AppStore>((set, get) => ({
  // ─── 初始值 ───
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

  // ─── 数据加载 ───
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

  // ─── 项目 CRUD ───
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

  // ─── 主题 / 语言 / 导航 ───
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

  // ─── 分组 CRUD ───
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
  // reorderAll(projectIds): 按给定 ID 顺序重排项目列表
  //
  // 策略: 乐观更新 (optimistic update)
  //   1. 立即更新前端 state（用户马上看到效果）
  //   2. 异步调 Rust 后端持久化
  //   3. 如果后端失败 → 回滚到旧 state
  // =========================================================================
  reorderAll: async (projectIds) => {
    const prevProjects = [...get().projects];           // 快照备份
    const idSet = new Set(projectIds);
    const ordered = projectIds.map((id) => prevProjects.find((p) => p.id === id)!).filter(Boolean);
    const remaining = prevProjects.filter((p) => !idSet.has(p.id));
    set({ projects: [...ordered, ...remaining] });      // 乐观更新前端

    try {
      await api.reorderAll([...ordered, ...remaining].map((p) => p.id));
      log.api("REORDER", { order: [...ordered, ...remaining].map((p) => p.id) }, true);
    } catch (e) {
      set({ projects: prevProjects });                  // 回滚
      log.api("ERROR", { error: String(e) }, false);
      log.rollback(String(e), prevProjects);
      console.error("Failed to persist order:", e);
    }
  },

  // =========================================================================
  // batchMoveAndReorder: 原子地"改分组 + 重排序"
  //
  // groupChanges: [{projectId: "a", groupId: "G1"}, ...]
  // finalOrder:   排序后的项目 ID 列表
  //
  // 注意: 当前实现是多次顺序 IPC 调用，存在部分失败风险。
  //       未来应改为一个 Rust batch_update 原子命令。
  // =========================================================================
  batchMoveAndReorder: async (groupChanges, finalOrder) => {
    const prevProjects = [...get().projects];
    const changes = new Map(groupChanges.map((c) => [c.projectId, c.groupId]));

    // 先用 groupChanges 修改 group_id
    const updated = prevProjects.map((p) =>
      changes.has(p.id) ? { ...p, group_id: changes.get(p.id)! } : p
    );

    // 再按 finalOrder 重排
    const idSet = new Set(finalOrder);
    const ordered = finalOrder.map((id) => updated.find((p) => p.id === id)!).filter(Boolean);
    const remaining = updated.filter((p) => !idSet.has(p.id));
    const finalProjects = normalizeGroupOrder([...ordered, ...remaining]);

    log.normalize([...ordered, ...remaining], finalProjects);
    set({ projects: finalProjects });  // 乐观更新

    try {
      // 依次执行分组变更 + 排序
      for (const { projectId, groupId } of groupChanges) {
        await api.setProjectGroup(projectId, groupId);
        log.api("SET_GROUP", { projectId, groupId }, true);
      }
      await api.reorderAll(finalProjects.map((p) => p.id));
      log.api("REORDER", { order: finalProjects.map((p) => p.id) }, true);
    } catch (e) {
      set({ projects: prevProjects });  // 任一失败 → 全部回滚
      log.api("ERROR", { error: String(e) }, false);
      log.rollback(String(e), prevProjects);
      console.error("batchMoveAndReorder: rollback", e);
    }
  },

  // ─── 模板 ───
  createTemplate: async (name, description, files) => { await api.createTemplate(name, description, files); await get().loadTemplates(); },
  removeTemplate: async (name) => { await api.removeTemplate(name); await get().loadTemplates(); },

  // ─── Pin / 更新 ───
  togglePin: async () => { const next = !get().pinned; set({ pinned: next }); try { await api.setPinned(next); } catch { /* ignore */ } },
  setPinnedState: (pinned) => { set({ pinned }); api.setPinned(pinned).catch(() => {}); },
  setUpdateAvailable: (update) => set({ updateAvailable: update }),
  setUpdateProgress: (progress) => set({ updateProgress: progress }),
  setUpdateStatus: (status) => set({ updateStatus: status }),

  // ─── Toast 通知 ───
  addToast: (message, type) => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, type }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3000);
  },
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

// ─── AppStore 类型定义（所有字段 + 方法的签名） ───
// 放在 create() 之后，因为 TypeScript 需要先有实现再声明类型
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
