# Mutsumi Launcher — Design Document

> 本地项目环境 GUI 管理软件 | MVP 设计规格
> Date: 2026-05-19

---

## 1. Overview

**Mutsumi Launcher** 是一个本地项目环境管理器。用户通过全局快捷键快速唤醒一个三栏 GUI 面板，管理本地项目文件夹、一键启动开发环境、注入项目模板、执行 Git 操作，并与 Mutsumi-s-SYNC 的远程 agent 同步项目属性。

### 核心约束

- 冷启动 < 0.5s（含窗口渲染）
- <= 10MB 包体
- 不依赖 Node.js 运行时（打包后独立运行）

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| GUI Framework | **Tauri v2** | Rust 后端 + WebView2 前端，<300ms 冷启动，<10MB 包体 |
| Frontend | **React 18** + **Tailwind CSS 4** + **shadcn/ui** | 组件化 + 原子化样式，暗/亮双模式 `dark:` 前缀 |
| Bundler | Vite (via `@tauri-apps/cli`) | 标准 Tauri + React 模板 |
| Data Storage | **单 JSON 文件** (`%APPDATA%\mutsumi-launcher\projects.json`) | MVP 轻量，零依赖，便于与 SYNC 的 JSON 协议对齐 |
| Plugins | `tauri-plugin-shell`, `tauri-plugin-fs`, `tauri-plugin-global-shortcut`, `tauri-plugin-autostart` | Tauri 官方生态 |

---

## 3. MVP Scope

### P0 — 必须交付

| Feature | Description |
|---------|-------------|
| **Core Launcher** | 系统托盘常驻 + 开机自启 + 全局快捷键唤醒/隐藏窗口 |
| **Project Manager** | 添加文件夹、项目列表（chat-like）、一键启动编辑器 |
| **Templates** | 文件夹模板（template.json 描述元信息）、文件注入 + 变量替换 |

### P1 — 延后

| Feature | Description |
|---------|-------------|
| **Basic Git** | Pull / Push / Fetch + 分支和状态展示 |
| **SYNC Collaboration** | 与 Mutsumi-s-SYNC HTTP 通信，同步项目属性 JSON |

### P2 — 未来

| Feature | Description |
|---------|-------------|
| **Advanced Git** | Merge / Rebase / Stash / 冲突处理 |

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Tauri Window (WebView2)             │
│  ┌──────┬──────────────┬────────────────────────┐   │
│  │ Nav  │ Project List │   Detail / Home        │   │
│  │ Icons│ (chat-style) │   Panel                │   │
│  └──────┴──────────────┴────────────────────────┘   │
│              React + Tailwind + shadcn/ui            │
├──────────────────────────────────────────────────────┤
│                  Tauri Commands (Rust)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Project  │ │ Template │ │ Git      │ │System  │ │
│  │ Manager  │ │ Injector │ │ Runner   │ │Service │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────────────────────────────────────────┐    │
│  │  JSON Store  │  Tauri Plugins                │    │
│  │  (read/write)│  (shell/fs/shortcut/autostart)│    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Rust Commands (Tauri IPC)

| Command | Description |
|---------|-------------|
| `list_projects` | 读取 JSON 返回项目数组 |
| `add_project` | 打开文件选择器，选择文件夹，写入 JSON |
| `remove_project` | 从 JSON 删除指定项目 |
| `update_project` | 更新项目属性（star, tags, editors） |
| `launch_editor` | 调用 shell 启动编辑器，注入路径 |
| `inject_template` | 复制模板文件夹 → 目标路径 → 执行变量替换 |
| `git_status` | 在项目路径执行 `git status --porcelain` |
| `git_pull` / `git_push` / `git_fetch` | 执行对应 git 命令 |
| `get_settings` / `update_settings` | 读写全局设置 |

### Frontend Component Tree

```
App
├── TrayManager        (Rust-managed, system tray)
├── GlobalShortcut     (Rust-managed, Alt+Space default)
├── ThemeProvider      (dark/light context)
├── WindowShell
│   ├── LeftNav        (Home | Projects | Templates | Git | Settings)
│   ├── ProjectList    (filterable, draggable? no)
│   │   ├── HomeItem   (special first entry)
│   │   └── ProjectItem
│   └── RightPanel
│       ├── HomeView         (recent + starred projects)
│       ├── ProjectDetail    (launch, git, tags, info, activity)
│       ├── TemplateView     (category grid → select → inject)
│       ├── GitView          (status + operations)
│       └── SettingsView     (shortcut, editors, autostart, theme)
```

---

## 5. Data Model

### `%APPDATA%\mutsumi-launcher\projects.json`

```jsonc
{
  "projects": [
    {
      "id": "uuid-v4",
      "name": "my-app",
      "path": "D:\\dev\\my-app",
      "editors": ["vscode", "cursor"],
      "starred": true,
      "tags": ["web", "react"],
      "lastOpened": "2026-05-19T10:00:00Z",
      "activityLog": [
        { "action": "git_pull", "detail": "origin/main", "time": "2026-05-19T08:00:00Z" }
      ],
      "syncId": null             // P1: Mutsumi-s-SYNC reference
    }
  ],
  "settings": {
    "theme": "dark",
    "shortcut": "Alt+Space",
    "autostart": true,
    "editors": [
      {
        "id": "vscode",
        "name": "VS Code",
        "path": "C:\\Users\\...\\Code.exe",
        "args": ["{path}"]
      },
      {
        "id": "cursor",
        "name": "Cursor",
        "path": "C:\\Users\\...\\Cursor.exe",
        "args": ["{path}", "--reuse-window"]
      },
      {
        "id": "terminal",
        "name": "Terminal",
        "path": "wt.exe",
        "args": ["-d", "{path}"]
      }
    ]
  },
  "templates": [
    {
      "id": "uuid-v4",
      "name": "Academic LaTeX",
      "path": "%APPDATA%\\mutsumi-launcher\\templates\\academic-latex",
      "category": "writing",
      "tags": ["latex", "paper"],
      "variables": ["TITLE", "AUTHOR"],
      "conflict": "skip",
      "postCreate": "code ."
    }
  ]
}
```

### Template Definition (`template.json`)

```jsonc
{
  "name": "Academic LaTeX",
  "category": "writing",
  "tags": ["latex", "paper"],
  "variables": ["TITLE", "AUTHOR"],
  "conflict": "skip",        // skip | overwrite | ask
  "postCreate": "code ."     // optional shell command
}
```

---

## 6. Design System

### Principles

- **无边框 (Borderless)** — 不依赖边框区分层级，纯靠背景色深浅
- **全直角 (Sharp)** — `border-radius: 0`，硬朗干练
- **低饱和 (Muted)** — 主题色饱和度低，信息层次靠明度区分
- **双模式** — Tailwind `dark:` 前缀实现暗/亮切换，左侧导航栏底部按钮触发

### Color Palette

| Role | Dark | Light |
|------|------|-------|
| Base | `#0d0d0d` | `#f5f4f0` |
| Panel (elevated) | `#111111` | `#faf9f5` |
| Card / Group | `#141414` | `#f0ede5` |
| Hover / Active | `#1a1a1a` | `#e8e3d8` |
| Primary (launch) | `#3a5068` | `#c5d5e8` |
| Success (git) | `#4a5a4a` | `#5a7a5a` |
| Warning (dirty) | `#6b5a4a` | `#c0a060` |
| Tag bg | `#1e2228` | `#e0ddd5` |
| Text primary | `#e0e0e0` | `#2a2a2a` |
| Text secondary | `#b0b0b0` | `#5a5a5a` |
| Text muted | `#505050` | `#a0a0a0` |

### Typography

- Font: system-ui stack (`Segoe UI`, sans-serif)
- Hierarchy: title (20px 600), body (13px), muted (11px), labels (10px uppercase)
- No color contrast issues — all text layers meet WCAG AA on dark/light

### Layout

- Window: min 900×550px, default 960×620px, resizable
- Three-column: Nav (56px) + List (260px) + Detail (flex)
- When selecting "Home" in nav, center list shows recent + starred; right panel shows dashboard

---

## 7. Window Behavior

| Behavior | Detail |
|----------|--------|
| Startup | 注册为 autostart 条目 → 后台启动 → 隐藏窗口 → 系统托盘 |
| Wake | 按全局快捷键 → 如果窗口不存在则创建 → show + focus |
| Hide | 失去焦点自动隐藏，或按 ESC / 再次按快捷键 |
| Tray | 右键菜单：[Show] [Settings] [Quit]，左键 toggle 窗口 |
| Performance | Rust 侧在后台保持进程，窗口创建走 `WebviewWindowBuilder::new` < 10ms，前端用 React.lazy 延迟加载非首屏组件 |

---

## 8. Template System

Templates live in `%APPDATA%\mutsumi-launcher\templates\<template-name>\`. Each contains:
- `template.json` — metadata
- Arbitrary files and folders — injected into the target project

**Injection flow:**
1. User selects template from TemplateView (browse by category/tags)
2. User selects target project (or creates new folder)
3. Fill in variables (if any) — e.g., `TITLE=MyPaper`
4. System copies files → replaces `{{ VAR_NAME }}` in content and filenames
5. If `postCreate` is set, executes the command in target directory

**Conflict resolution:** per template.json `conflict` field: `skip` (default), `overwrite`, or `ask`.

---

## 9. Editor Configuration

Editors are configured globally in settings. Each editor entry:

```json
{
  "id": "unique-id",
  "name": "Display Name",
  "path": "/absolute/path/to/executable",
  "args": ["arg1", "{path}", "arg3"]
}
```

- `{path}` placeholder is replaced with project directory at launch time
- User can select multiple editors per project (combination launch)
- "Launch All" button fires all selected editors in parallel

---

## 10. SYNC Integration (P1)

Communication with Mutsumi-s-SYNC:

- **Protocol**: HTTP REST (local agent proxy or direct server connection)
- **Direction**: Push local project attributes to SYNC server → agent receives and acts
- **Payload**: Subset of project JSON (id, name, path, tags, git status, lastOpened)
- **Endpoint**: Configured in settings (`syncServerUrl`)
- **Trigger**: On project change or manual sync button

---

## 11. File Structure (Tauri + React)

```
mutsumi-launcher/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs            # Tauri entry, tray, autostart, shortcut
│       ├── lib.rs             # Tauri command registration
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── projects.rs    # CRUD for projects
│       │   ├── templates.rs   # File injection engine
│       │   ├── git.rs          # Git command wrapper
│       │   ├── editors.rs     # Shell launch
│       │   └── settings.rs    # Read/write settings
│       └── store.rs           # JSON file read/write abstraction
├── src/
│   ├── main.tsx               # React entry
│   ├── App.tsx                 # Root component, routing
│   ├── components/
│   │   ├── LeftNav.tsx
│   │   ├── ProjectList.tsx
│   │   ├── RightPanel.tsx
│   │   ├── HomeView.tsx
│   │   ├── ProjectDetail.tsx
│   │   ├── TemplateView.tsx
│   │   ├── GitView.tsx
│   │   ├── SettingsView.tsx
│   │   └── ui/                # shadcn/ui primitives
│   ├── lib/
│   │   ├── tauri.ts           # Tauri invoke wrappers
│   │   ├── store.ts           # Frontend state (zustand)
│   │   └── theme.ts           # Dark/light context
│   └── styles/
│       └── globals.css        # Tailwind + custom theme
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── .gitignore
```

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WebView2 not installed on target Windows | Tauri v2 supports embedding WebView2 bootstrapper; detect at first launch |
| Global shortcut conflict with other apps | Detect failure, prompt user to change in settings |
| JSON file corruption | Keep backup of last valid state; on read failure, restore backup |
| Large project lists (100+) slow UI | Use `react-virtuoso` for virtualized list; minimal concern for MVP |
| Tauri build complexity on Windows | Use `tauri-cli` scaffolding; follow official Windows build guide |

---

## 13. Dev Setup Commands

```bash
# Prerequisites
# - Rust toolchain: https://rustup.rs
# - Node.js 20+
# - Microsoft Visual Studio C++ Build Tools

npm create tauri-app@latest mutsumi-launcher -- --template react-ts
cd mutsumi-launcher
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install @tauri-apps/plugin-shell @tauri-apps/plugin-fs @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-autostart
npm install zustand @tauri-apps/api
cargo tauri dev
```
