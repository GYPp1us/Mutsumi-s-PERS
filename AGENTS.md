# AGENTS.md

Tauri v2 桌面应用（仅 Windows）。`src/` = React 18 + Tailwind v4，`src-tauri/` = Rust 后端。

## 环境

- Rust **必须** MSVC 工具链：`stable-x86_64-pc-windows-msvc`（GNU 链 DLL 符号超限）
- VS 2022 Build Tools（C++ 工作负载），否则 `link.exe` 缺失
- Node.js >= 20，WebView2（Win10/11 自带）

```
rustup show active-toolchain  # 确认 msvc
```

## 常用命令

```bash
npm install                            # 前端依赖
npm run build                          # tsc -b && vite build
npm run lint                           # eslint .
cargo tauri dev                        # 开发模式（Vite HMR + Rust 重编译）
cargo tauri build --debug              # 构建 debug 版
cargo check --manifest-path src-tauri/Cargo.toml  # 仅 Rust 检查
```

`npm run build` 先跑 `tsc -b`（TypeScript 严格模式：`noUnusedLocals` + `noUnusedParameters`），再跑 Vite。项目中无测试框架。

## 踩坑

- **Vite `base` 必须是 `"./"`**：默认 `/` 导致构建后 exe 加载资源失败（"拒绝连接"）
- **`main.rs` 必须无条件 `#![windows_subsystem = "windows"]`**：`cfg_attr` 在 debug 会弹控制台
- **`Cargo.toml` 的 `crate-type` 必须含 `"staticlib"`**（`["staticlib", "cdylib", "rlib"]`），缺了会链接失败
- **`拒绝访问 (os error 5)`**：旧进程锁定。`Get-Process -Name "mutsumi-s-pres" | Stop-Process -Force`
- **`link.exe not found`**：工具链不是 MSVC。`rustup default stable-x86_64-pc-windows-msvc`
- **Rust 最低 1.77.2**（Cargo.toml `rust-version`），新版直接 `rustup update`

## 架构

```
React → Zustand (src/lib/store.ts) → tauri.ts (invoke 封装) → Rust Command → store.rs (JSON)
```

**15 个 IPC 命令**（前端全部走 `src/lib/tauri.ts`，不直接调 `invoke`）：

| 同步 | 异步 |
|------|------|
| `list_projects` `add_project` `remove_project` `update_project` | `launch_editor` |
| `get_settings` `update_settings` | `git_status` `git_pull` `git_push` `git_fetch` |
| `hide_window` `set_pinned` `start_drag_pin` | |
| `inject_template` | |

新增 Rust 命令时注意 `async` vs sync 签名会影响 Tauri 线程模型。

**数据存储**：`%APPDATA%\mutsumi-s-pres\projects.json`。`store.rs:load_or_default()` 自动生成默认配置（VS Code + Terminal 编辑器预设）。命令都走 `Mutex<store>`，修改后调 `store.save()`。

**自动更新**：`tauri-plugin-updater` + GitHub Releases。构建时 `createUpdaterArtifacts: true` 生成 `.sig`/`.zip` 产物，`tauri-action` 输出 `latest.json`。运行时前端 `check()` 拉取 manifest，验证签名后流式下载安装，`Windows passive` 模式静默升级。密钥在 `~/.tauri/mutsumi-pres.key`，公钥固化在 `tauri.conf.json`，私钥以 CI secret `TAURI_SIGNING_PRIVATE_KEY` 传入 `build.yml`。

## 关键约定

- **编辑器启动**：Rust 侧 `cmd /c start "" <path> <args>` 包装（`CREATE_NO_WINDOW` 会压制 GUI 窗口），`{path}` 替换为项目路径
- **模板**：`{{ VAR_NAME }}` 替换文件名+内容，模板目录 `%APPDATA%\mutsumi-s-pres\templates\<name>\`，必须含 `template.json`
- **主题**：`src/index.css` 的 `@theme` 块 + `[data-theme="dark|light"]` 覆盖，localStorage key `mutsumi-theme`
- **国际化**：`src/lib/i18n.ts` 中英双语，`useT()` hook，`locale` 存 localStorage key `mutsumi-locale`
- **窗口拖动**：`<div data-tauri-drag-region>` 在钻石图标上，mousedown 触发 `start_drag_pin` 防止拖动中失焦隐藏
- **Pin 双状态**：`pinned`（用户主动钉选）+ `drag_pinned`（拖动中自动设），**两者都为 false** 才触发失焦隐藏

## 设计原则

- **无窗口命令行**：所有 Rust `Command` 加 `creation_flags(0x08000000)`（`CREATE_NO_WINDOW`）
- **Loading 态**：异步操作按钮必须加 `btn-loading` class + `disabled`，文字显示 `· · ·`，用 `<ActionButton>` 组件
- **直角**：`border-radius: 0 !important`（`src/index.css:39`）
- **失焦自动隐藏**：`on_window_event(Focused(false))` → `window.hide()`（除非 pinned）
- **ESC 行为**：设置开则关设置，否则 `invoke("hide_window")`
- **图标**：全 `lucide-react`，统一 `size={18}` `strokeWidth={1.5}`

## GitHub Actions (`.github/workflows/`)

| 文件 | 触发 | 内容 |
|------|------|------|
| `ci.yml` | push/PR → master | 前端 `tsc -b` + `vite build`（ubuntu），Rust `cargo check`（windows-msvc） |
| `build.yml` | PR → master / `v*` tag / 手动 | `tauri-apps/tauri-action@v0` 构建，产物上传 Artifact。`v*` tag 发布到 Release |

`build.yml` 从 git tag 同步版本号到 `tauri.conf.json` 后再构建。

## 分支 & Changelog

- **禁止在 `master` 或 `dev` 上直接提交**。所有改动（无论大小）都从 `master` 签出新分支 → PR → `master`
- 分支命名：`feat/<name>`（功能）、`fix/<name>`（修复）、`chore/<name>`（杂项）、`docs/<name>`（文档）
- **拆分提交 + 及时验证**：每个逻辑完整的功能点单独 commit（如依赖安装 → 后端 → 前端），每完成一个功能后提醒用户验证
- 打 `v*` tag → CI 自动发布
- 每次 PR 合入 master 时，在 `CHANGELOG.md` 顶部追加：

```markdown
## [版本号] - YYYY-MM-DD

### Added / Changed / Fixed / Removed
- 简短描述 (#PR号)
```

版本号与 git tag 一致。`build.yml` 的 `releaseBody` 引用此文件生成 Release 正文。
