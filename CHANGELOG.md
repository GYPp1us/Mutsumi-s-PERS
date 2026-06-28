# Changelog

## [1.2.5] - 2026-06-29

### Added
- Finalized deterministic grouped drag interactions for the sidebar list

### Changed
- Unified drag hover, settle, and group-highlight behavior across grouped and ungrouped items
- Kept setup wizard and default project path settings alongside the drag refactor

### Fixed
- Merge conflicts resolved between `master` and `feat/group-drag`

## [1.2.4] - 2026-06-24

### Added
- First-launch setup wizard for global shortcut configuration
- Startup error logging to `%APPDATA%\mutsumi-s-pres\startup_error.log`

### Fixed
- Silent crash on startup when tray/shortcut/updater initialization fails
- Global shortcut conflict no longer prevents app from launching

## [1.0.0] - 2026-05-23

### Added
- Project renamed to Mutsumi-s PRES
- CHANGELOG.md with Keep a Changelog format

### Changed
- CI: `softprops/action-gh-release` for proper Release asset upload
- CI version sync strips pre-release suffix
- All references updated from `mutsumi-launcher` to `mutsumi-s-pres`

## [0.2.4] - 2026-05-23

### Changed
- CI: `tauri-action@v0` + `softprops/action-gh-release` for proper asset upload
- CI version sync strips pre-release suffix (e.g. `v0.2.4-beta` → `0.2.4`)
- Create `CHANGELOG.md` with Keep a Changelog format
- AGENTS.md: document changelog maintenance convention

## [0.2.3] - 2026-05-22

### Changed
- CI build mode: `--debug` → release

## [0.2.2] - 2026-05-22

### Changed
- `tauri.conf.json` version placeholder `0.1.0` → `0.0.0`
- CI syncs version from git tag before building

## [0.2.1] - 2026-05-22

### Fixed
- Release tag version mismatch (no assets uploaded)

## [0.2.0] - 2026-05-22

### Added
- Lucide React icons replacing Unicode/emoji in all components
- Window drag via Diamond icon (`data-tauri-drag-region`)
- Pin button: toggle focus-loss hide behavior (Rust `AtomicBool`)
- `ActionButton` reusable component with loading/hover/press animations
- Button loading state: `· · ·` pulse animation + disabled for all async operations
- `CHANGELOG.md` with Keep a Changelog format
- CI workflow for version sync from git tag

### Changed
- Editor launch wrapped in `cmd /c start ""` to prevent `CREATE_NO_WINDOW` suppressing GUI
- Editor command resolution uses `which` crate for PATH-independent lookup
- Settings editor help text includes usage examples
- Template injection errors shown via toast only, no inline display
- `onMouseLeave` unconditionally resets button hover styles

### Fixed
- Window drag triggers focus loss — added `drag_pinned` AtomicBool auto-reset on `Focused(true)`
- Template inject button loading state synchronization

## [0.1.0] - 2026-05-19

### Added
- Tauri v2 + React 18 + Tailwind CSS 4 project scaffold
- System tray resident, auto-start on boot
- Alt+Space global hotkey to wake/hide window
- Folder-based project management with search filter
- One-click launch development environment (VS Code, Cursor, Terminal, custom)
- Template injection system with `{{ VAR }}` variable substitution
- Basic Git operations: Fetch / Pull / Push / Status
- Dark/light dual theme (borderless, sharp-corner design)
- Chinese/English i18n via `useT()` hook
- Settings modal overlay, ESC to close
- Active monitor centering on wake
- Auto-hide on focus loss
- Toast notifications (success / error / info)
- Button hover/press transition animations
- Window titlebar hidden (`decorations: false`)
