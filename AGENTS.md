# AGENTS.md

## 项目定位

Tauri v2 桌面应用——不是 Web 应用。`src/` 是前端（React + Tailwind v4），`src-tauri/` 是 Rust 后端。

## 环境要求

- **Rust 必须使用 MSVC 工具链**（`stable-x86_64-pc-windows-msvc`）。GNU 工具链会因 DLL 导出符号数超限导致链接失败
- **Visual Studio 2022 Build Tools**（C++ 工作负载），否则 link.exe 缺失
- Node.js >= 20
- WebView2（Win10/11 自带）

```bash
# 确认工具链
rustup show active-toolchain   # 必须是 msvc
```

## 常见踩坑

- **Vite `base` 必须设为 `"./"`**：默认 `/` 绝对路径导致构建的 exe 加载资源失败（显示"拒绝连接"）。`cargo tauri dev` 不受影响因为走 Vite dev server
- **`main.rs` 必须无条件 `#![windows_subsystem = "windows"]`**：默认的 `cfg_attr(not(debug_assertions), ...)` 在 debug build 会弹控制台窗口
- **Rust 版本要 >= 1.78**：旧版 Cargo 不支持 `edition2024` 的传递依赖，会导致下载 crate 失败

## 常用命令

```bash
npm install                     # 仅前端依赖
cargo tauri dev                 # 开发模式（Vite hmr + Rust 重编译）
cargo tauri build --debug       # 构建 debug 版（产物在 src-tauri/target/debug/）
npm run build                   # 仅前端构建，不编译 Rust
cargo check --manifest-path src-tauri/Cargo.toml  # 仅检查 Rust 语法
```

构建产物：
- `src-tauri/target/debug/mutsumi-launcher.exe` — 可执行文件
- `src-tauri/target/debug/bundle/msi/` — MSI 安装包
- `src-tauri/target/debug/bundle/nsis/` — NSIS 安装包

## 架构

```
React 组件 → Zustand (src/lib/store.ts) → tauri.ts (invoke IPC) → Rust Command → store.rs (JSON)
```

**IPC 命令清单**（12 个）：
`list_projects` `add_project` `remove_project` `update_project`
`launch_editor` `git_status` `git_pull` `git_push` `git_fetch`
`inject_template` `get_settings` `update_settings`

前端不直接调 `invoke()`，全部走 `src/lib/tauri.ts` 的封装函数。

**数据存储**：`%APPDATA%\mutsumi-launcher\projects.json`。首次启动 `store.rs:load_or_default()` 自动生成默认配置（含 VS Code + Terminal 编辑器预设）。

## 关键约定

- **编辑器配置**：`args` 数组中的 `{path}` 在启动时替换为项目路径
- **模板变量**：`{{ VAR_NAME }}`（双花括号），替换文件名和文件内容
- **模板目录**：`%APPDATA%\mutsumi-launcher\templates\<name>\`，必须含 `template.json`
- **主题**：CSS 变量在 `src/index.css` 的 `@theme` 块定义，via `data-theme="dark|light"`
- **全直角**：`src/index.css` 有 `border-radius: 0 !important`
- **窗口默认隐藏**：`tauri.conf.json` 中 `visible: false`，通过托盘/快捷键唤醒

## 文件职责速查

| 文件 | 职责 |
|------|------|
| `src-tauri/src/lib.rs` | 托盘 + 快捷键 + 插件 + 命令注册 |
| `src-tauri/src/store.rs` | JSON 读写 + 数据模型 + 默认值 |
| `src-tauri/src/commands/*.rs` | 每个文件一组 IPC 命令 |
| `src/lib/store.ts` | Zustand 全局状态（projects / settings / navView / theme） |
| `src/lib/tauri.ts` | invoke 封装，类型定义 |
| `src/components/RightPanel.tsx` | 根据 navView + selectedProjectId 路由子面板 |
| `src/index.css` | Tailwind v4 @theme + 暗/亮双主题变量 |
| `src-tauri/tauri.conf.json` | 窗口尺寸、构建命令、bundle 配置 |
| `src-tauri/capabilities/default.json` | 权限白名单（shell/fs/dialog/shortcut/autostart） |
