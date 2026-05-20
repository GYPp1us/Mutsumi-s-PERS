# Mutsumi Launcher

本地项目环境 GUI 管理工具。快捷键一键唤醒，文件夹归档项目，快速启动开发环境。

## 功能

- **系统托盘常驻** — 开机自启，后台运行
- **全局快捷键** — `Alt + Space` 唤醒/隐藏窗口（可在设置中修改）
- **项目管理** — 以文件夹形式归档项目，支持搜索过滤
- **一键启动** — 配置自定义编辑器（VS Code / Cursor / Terminal 等），一键拉起开发环境
- **模板系统** — 按模板快速注入文件到项目（如 LaTeX、Python venv 等）
- **Git 操作** — 快速 Pull / Push / Fetch / Status
- **暗/亮双主题** — 无边框直角低饱和设计风格

## 技术栈

| 层 | 技术 |
|---|------|
| GUI 框架 | Tauri v2 |
| 前端 | React 18 + Tailwind CSS 4 + Zustand |
| 后端 | Rust |
| 存储 | JSON 文件 (`%APPDATA%\mutsumi-launcher\projects.json`) |

## 开发环境要求

- **Node.js** >= 20
- **Rust** >= 1.77（需 MSVC 工具链）
- **Visual Studio 2022 Build Tools**（C++ 工作负载）
- **WebView2**（Windows 10/11 自带）

## 快速开始

```bash
# 安装前端依赖
npm install

# 开发模式（热重载）
cargo tauri dev

# 构建生产版本
cargo tauri build
```

## 项目结构

```
mutsumi-launcher/
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── main.rs         # 入口
│       ├── lib.rs          # 托盘、快捷键、命令注册
│       ├── store.rs        # JSON 存储
│       └── commands/       # Tauri 命令
│           ├── projects.rs # 项目 CRUD
│           ├── editors.rs  # 编辑器启动
│           ├── templates.rs# 模板注入
│           ├── git.rs      # Git 操作
│           └── settings.rs # 设置读写
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   │   ├── LeftNav.tsx     # 左侧导航
│   │   ├── ProjectList.tsx # 项目列表
│   │   ├── RightPanel.tsx  # 右侧面板路由
│   │   ├── HomeView.tsx    # 首页
│   │   ├── ProjectDetail.tsx # 项目详情
│   │   ├── TemplateView.tsx  # 模板视图
│   │   ├── GitView.tsx     # Git 面板
│   │   └── SettingsView.tsx  # 设置页
│   └── lib/
│       ├── tauri.ts        # IPC 封装
│       ├── store.ts        # Zustand 状态
│       └── theme.ts        # 主题初始化
├── docs/                   # 设计文档
├── package.json
└── vite.config.ts
```

## 模板使用

1. 在 `%APPDATA%\mutsumi-launcher\templates\` 下创建文件夹
2. 在文件夹中放入任意文件
3. 添加 `template.json` 描述模板元信息

```json
{
  "name": "Academic LaTeX",
  "category": "writing",
  "tags": ["latex", "paper"],
  "variables": ["TITLE", "AUTHOR"],
  "conflict": "skip",
  "postCreate": "code ."
}
```

- 文件和文件名中的 `{{ VARIABLE }}` 会被替换
- `conflict`: `skip`（跳过已存在文件）、`overwrite`（覆盖）、`ask`（询问）
- `postCreate`: 注入后自动执行的命令

## 编辑器配置

在设置页面添加编辑器，支持 `{path}` 占位符：

```json
{
  "id": "cursor",
  "name": "Cursor",
  "path": "C:\\Users\\...\\Cursor.exe",
  "args": ["{path}", "--reuse-window"]
}
```
