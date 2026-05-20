import { createContext, useContext } from "react";

export const en = {
  navHome: "Home",
  navProjects: "Projects",
  navTemplates: "Templates",
  navGit: "Git",
  navSettings: "Settings",
  toggleTheme: "Toggle theme",

  projectListTitle: "Projects",
  filterPlaceholder: "Filter projects...",
  homeItem: "Home",
  projectCount: (n: number) => `${n} project${n !== 1 ? "s" : ""}`,
  selectFolderTitle: "Select project folder",
  unnamed: "unnamed",

  homeTitle: "Home",
  recentProjects: "Recent Projects",
  noProjects: "No projects yet. Add one with the + button.",
  starred: "Starred",
  noStarred: "No starred projects yet.",

  selectProject: "Select a project",
  launchEnv: "Launch Environment",
  launchAll: "\u25B6 All",
  tags: "Tags",
  noTags: "No tags",
  lastOpened: "Last Opened",
  recentActivity: "Recent Activity",

  gitTitle: (name: string) => `Git \u2014 ${name}`,
  gitSelectFirst: "Select a project from the list first.",
  operations: "Operations",
  fetch: "Fetch",
  pull: "Pull",
  push: "Push",
  status: "Status",
  runningGit: (op: string) => `Running git ${op}...`,
  done: "Done.",
  output: "Output",

  templatesTitle: "Templates",
  availableTemplates: "Available Templates",
  templateHelp:
    "Add custom templates by placing folders in %APPDATA%\\mutsumi-launcher\\templates\\ with a template.json file.",
  defaultTemplateName: "Default Template",
  defaultTemplateDesc: "Empty project starter",
  general: "general",
  targetProject: "Target Project",
  selectProjectPlaceholder: "Select project...",
  injectTemplate: "Inject Template",
  injecting: "Injecting...",
  injectedFiles: (n: number, name: string) => `Injected ${n} files into ${name}`,
  error: (e: unknown) => `Error: ${e}`,

  settingsTitle: "Settings",
  appearance: "Appearance",
  themeLabel: "Theme:",
  themeDark: "\u25C9 Dark",
  themeLight: "\u25CB Light",
  globalShortcut: "Global Shortcut",
  shortcutPlaceholder: "Alt+Space",
  editors: "Editors",
  editorName: "Name",
  editorPath: "Path",
  editorArgs: "Args (comma)",
  saveSettings: "Save Settings",
  settingsSaved: "Settings saved.",
  language: "Language",

  opened: "opened",
  viewedProject: "Viewed project",
};

export const zh: typeof en = {
  navHome: "\u9996\u9875",
  navProjects: "\u9879\u76EE",
  navTemplates: "\u6A21\u677F",
  navGit: "\u7248\u672C\u63A7\u5236",
  navSettings: "\u8BBE\u7F6E",
  toggleTheme: "\u5207\u6362\u4E3B\u9898",

  projectListTitle: "\u9879\u76EE",
  filterPlaceholder: "\u7B5B\u9009\u9879\u76EE...",
  homeItem: "\u9996\u9875",
  projectCount: (n: number) => `${n} \u4E2A\u9879\u76EE`,
  selectFolderTitle: "\u9009\u62E9\u9879\u76EE\u6587\u4EF6\u5939",
  unnamed: "\u672A\u547D\u540D",

  homeTitle: "\u9996\u9875",
  recentProjects: "\u6700\u8FD1\u9879\u76EE",
  noProjects: "\u6682\u65E0\u9879\u76EE\u3002\u70B9\u51FB + \u6DFB\u52A0\u3002",
  starred: "\u661F\u6807\u9879\u76EE",
  noStarred: "\u6682\u65E0\u661F\u6807\u9879\u76EE\u3002",

  selectProject: "\u8BF7\u9009\u62E9\u4E00\u4E2A\u9879\u76EE",
  launchEnv: "\u542F\u52A8\u73AF\u5883",
  launchAll: "\u25B6 \u5168\u90E8\u542F\u52A8",
  tags: "\u6807\u7B7E",
  noTags: "\u65E0\u6807\u7B7E",
  lastOpened: "\u6700\u8FD1\u6253\u5F00",
  recentActivity: "\u6700\u8FD1\u64CD\u4F5C",

  gitTitle: (name: string) => `\u7248\u672C\u63A7\u5236 \u2014 ${name}`,
  gitSelectFirst: "\u8BF7\u5148\u4ECE\u5217\u8868\u4E2D\u9009\u62E9\u4E00\u4E2A\u9879\u76EE\u3002",
  operations: "\u64CD\u4F5C",
  fetch: "\u83B7\u53D6",
  pull: "\u62C9\u53D6",
  push: "\u63A8\u9001",
  status: "\u72B6\u6001",
  runningGit: (op: string) => `\u6B63\u5728\u6267\u884C git ${op}...`,
  done: "\u5B8C\u6210\u3002",
  output: "\u8F93\u51FA",

  templatesTitle: "\u6A21\u677F",
  availableTemplates: "\u53EF\u7528\u6A21\u677F",
  templateHelp:
    "\u5C06\u6A21\u677F\u6587\u4EF6\u5939\u653E\u5165 %APPDATA%\\mutsumi-launcher\\templates\\ \u5E76\u5305\u542B template.json \u6587\u4EF6\u5373\u53EF\u6DFB\u52A0\u81EA\u5B9A\u4E49\u6A21\u677F\u3002",
  defaultTemplateName: "\u9ED8\u8BA4\u6A21\u677F",
  defaultTemplateDesc: "\u7A7A\u9879\u76EE\u6A21\u677F",
  general: "\u901A\u7528",
  targetProject: "\u76EE\u6807\u9879\u76EE",
  selectProjectPlaceholder: "\u9009\u62E9\u9879\u76EE...",
  injectTemplate: "\u6CE8\u5165\u6A21\u677F",
  injecting: "\u6CE8\u5165\u4E2D...",
  injectedFiles: (n: number, name: string) => `\u5DF2\u5411 ${name} \u6CE8\u5165 ${n} \u4E2A\u6587\u4EF6`,
  error: (e: unknown) => `\u9519\u8BEF: ${e}`,

  settingsTitle: "\u8BBE\u7F6E",
  appearance: "\u5916\u89C2",
  themeLabel: "\u4E3B\u9898\uFF1A",
  themeDark: "\u25C9 \u6697\u8272",
  themeLight: "\u25CB \u4EAE\u8272",
  globalShortcut: "\u5168\u5C40\u5FEB\u6377\u952E",
  shortcutPlaceholder: "Alt+Space",
  editors: "\u7F16\u8F91\u5668",
  editorName: "\u540D\u79F0",
  editorPath: "\u8DEF\u5F84",
  editorArgs: "\u53C2\u6570\uFF08\u9017\u53F7\u5206\u9694\uFF09",
  saveSettings: "\u4FDD\u5B58\u8BBE\u7F6E",
  settingsSaved: "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002",
  language: "\u8BED\u8A00",

  opened: "opened",
  viewedProject: "\u67E5\u770B\u4E86\u9879\u76EE",
};

export type Locale = typeof en;

export const LocaleCtx = createContext<Locale>(en);

export function useT() {
  return useContext(LocaleCtx);
}

export function getLocale(lang: string): Locale {
  return lang === "zh" ? zh : en;
}
