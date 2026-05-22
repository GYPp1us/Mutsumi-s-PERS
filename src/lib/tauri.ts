import { invoke } from "@tauri-apps/api/core";

export interface Project {
  id: string;
  name: string;
  path: string;
  editors: string[];
  starred: boolean;
  tags: string[];
  last_opened: string;
  activity_log: Activity[];
  sync_id: string | null;
}

export interface Activity {
  action: string;
  detail: string;
  time: string;
}

export interface EditorConfig {
  id: string;
  name: string;
  path: string;
  args: string[];
}

export interface Settings {
  theme: string;
  shortcut: string;
  autostart: boolean;
  editors: EditorConfig[];
}

export const listProjects = () => invoke<Project[]>("list_projects");
export const addProject = (name: string, path: string) =>
  invoke<Project>("add_project", { name, path });
export const removeProject = (id: string) =>
  invoke<void>("remove_project", { id });
export const updateProject = (
  id: string,
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
  variables: [string, string][],
  conflict: string
) =>
  invoke<string[]>("inject_template", {
    templatePath,
    targetPath,
    variables,
    conflict,
  });
