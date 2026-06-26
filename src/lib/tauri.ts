// ============================================================================
// 文件 1/10: src/lib/tauri.ts — 阅读顺序第 1 位
// 作用: 定义后端（Rust）传来的数据类型 + 封装所有 IPC 调用
//
// TS 语法速查（C++/Python 对照）:
//   export        = 让其他文件可以 import 使用 （类似 pub / __all__）
//   import        = 引入其他模块 （类似 #include / from X import Y）
//   interface     = 纯类型定义，编译后完全消失，不产生运行时代码
//   type          = 类型别名/联合类型 （类似 typedef / TypeAlias）
//   string | null = 联合类型: 可以是 string 也可以是 null
//                   （类似 std::optional<string> / Optional[str]）
//   ? 在字段名后  = 可选字段，实际值可以是 undefined
//   Promise<T>    = 异步操作的结果容器 （类似 std::future<T> / asyncio.Future）
//   async/await   = 异步语法糖，await 暂停直到 Promise 完成
//   invoke<T>()   = 调 Rust 后端命令，T 是返回值类型。这是 Tauri 框架提供的。
//   => (箭头函数)  = 匿名函数 （类似 lambda / lambda）
// ============================================================================

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Project: 单个项目的数据结构
// 这些字段由 Rust 后端通过 JSON 序列化发过来，TS 侧只定义"接收时"的类型
// ---------------------------------------------------------------------------
export interface Project {
  id: string;              // UUID 字符串
  name: string;            // 项目名称
  path: string;            // 文件系统路径
  editors: string[];       // string[] = 字符串数组
  starred: boolean;        // 是否收藏
  tags: string[];
  last_opened: string;     // ISO 8601 时间字符串
  activity_log: Activity[];
  sync_id: string | null;  // | null = 可为空（类似 Optional）
  group_id: string | null; // 所属分组的 ID，null 表示无分组
}

// Activity: 活动日志条目（嵌套在 Project 中）
export interface Activity {
  action: string;   // 动作类型
  detail: string;   // 动作详情
  time: string;     // 时间戳
}

// EditorConfig: 编辑器配置（VS Code / Terminal 等）
export interface EditorConfig {
  id: string;
  name: string;
  path: string;
  args: string[];   // 启动参数数组
}

// Settings: 全局设置
export interface Settings {
  theme: string;
  shortcut: string;
  autostart: boolean;
  silent_launch: boolean;
  default_project_path: string;
  editors: EditorConfig[];
}

// TemplateInfo / TemplateFile: 项目模板相关
export interface TemplateInfo {
  name: string;
  description: string;
  file_count: number;
}

export interface TemplateFile {
  name: string;
  content: string;
}

// GroupInfo: 分组元数据（颜色 + 折叠状态）
export interface GroupInfo {
  id: string;
  name: string;
  color: string;           // 如 "#586878"
  collapsed: boolean;      // 是否已折叠
}

// ===========================================================================
// 以下是对 Rust 后端的 IPC 调用封装
// invoke<T>("命令名", {参数对象}) → Promise<T>
//
// 例如: listProjects() 等价于 invoke<Project[]>("list_projects")
//       返回 Promise<Project[]>，调用方用 await 取值:
//         const projects = await listProjects();
// ===========================================================================

export const listProjects = () => invoke<Project[]>("list_projects");
export const addProject = (name: string, path: string) =>
  invoke<Project>("add_project", { name, path });

export const removeProject = (id: string) =>
  invoke<void>("remove_project", { id });

export const updateProject = (
  id: string,
  // Partial<Pick<Project, ...>>  = 只选取 Project 的部分字段，且都是可选的
  // 意思是: "从 Project 中挑出 name|starred|tags|editors，全部变成可选"
  updates: Partial<Pick<Project, "name" | "starred" | "tags" | "editors">>
) => invoke<Project>("update_project", { id, ...updates });

export const launchEditor = (editorId: string, projectPath: string) =>
  invoke<void>("launch_editor", { editorId, projectPath });

export const getSettings = () => invoke<Settings>("get_settings");
export const updateSettings = (settings: Settings) =>
  invoke<void>("update_settings", { settings });

export const gitStatus = (projectPath: string) =>
  invoke<string>("git_status", { projectPath });
export const gitPull = (projectPath: string) =>
  invoke<string>("git_pull", { projectPath });
export const gitPush = (projectPath: string) =>
  invoke<string>("git_push", { projectPath });
export const gitFetch = (projectPath: string) =>
  invoke<string>("git_fetch", { projectPath });

export const setPinned = (pinned: boolean) =>
  invoke<void>("set_pinned", { pinned });
export const startDragPin = () =>
  invoke<void>("start_drag_pin");

export const injectTemplate = (
  templatePath: string,
  targetPath: string,
  variables: [string, string][],  // [string,string][] = 二维字符串数组（键值对列表）
  conflict: string
) =>
  invoke<string[]>("inject_template", {
    templatePath, targetPath, variables, conflict,
  });

export const reorderProjects = (ids: string[]) =>
  invoke<void>("reorder_projects", { ids });

export const createProject = (
  name: string,
  path: string,
  templateName: string | null
) =>
  invoke<Project>("create_project", { name, path, templateName });

export const listTemplates = () =>
  invoke<TemplateInfo[]>("list_templates");

export const createTemplate = (
  name: string,
  description: string,
  files: TemplateFile[]
) =>
  invoke<void>("create_template", { name, description, files });

export const removeTemplate = (name: string) =>
  invoke<void>("remove_template", { name });

// ─── 分组相关 IPC ───
export const createGroup = (name: string, color: string) =>
  invoke<GroupInfo>("create_group", { name, color });

export const listGroups = () =>
  invoke<GroupInfo[]>("list_groups");

export const deleteGroup = (id: string) =>
  invoke<void>("delete_group", { id });

export const renameGroup = (id: string, name: string) =>
  invoke<void>("rename_group", { id, name });

export const toggleGroup = (id: string, collapsed: boolean) =>
  invoke<void>("toggle_group", { id, collapsed });

// setProjectGroup: 将一个项目分配到某个分组（groupId 可 null = 移出分组）
export const setProjectGroup = (projectId: string, groupId: string | null) =>
  invoke<void>("set_project_group", { projectId, groupId });

// reorderAll: 批量重排项目顺序（传入排序后的 id 数组）
export const reorderAll = (projectIds: string[]) =>
  invoke<void>("reorder_projects", { ids: projectIds });

// ─── 自动更新 ───
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// UpdateProgressEvent: 联合类型（"|" 分隔），三种变体共用一个 type 名
// 类似 discriminated union / tagged union
export type UpdateProgressEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data: Record<string, never> };

export const checkForUpdate = () => check();

export const downloadAndInstallUpdate = async (
  update: Update,
  onEvent: (event: UpdateProgressEvent) => void  // 回调函数类型: 接收 event，无返回值
) => {
  await update.downloadAndInstall((e) => {
    const ev = e as { event: string; data?: { contentLength?: number; chunkLength?: number } };
    if (ev.event === "Started") {
      onEvent({ event: "Started", data: { contentLength: ev.data?.contentLength } });
    } else if (ev.event === "Progress") {
      onEvent({ event: "Progress", data: { chunkLength: ev.data?.chunkLength ?? 0 } });
    } else {
      onEvent({ event: "Finished", data: {} });
    }
  });
  await relaunch();   // 下载完成后重启应用
};
