// ============================================================================
// src/components/ProjectList.tsx
// 作用: 侧边栏容器 — 自建 pointer 事件体系替代 dnd-kit
//
// 拖拽生命周期:
//   1. pointerdown on [data-drag-handle] → 记录起点 + 启动 300ms 计时器
//   2. pointermove 超过 5px 但未到 300ms → 取消 (判为点击操作)
//   3. 300ms 到且未超 5px → 触发 drag start (建快照 + 设 active)
//   4. 拖拽中 pointermove → 每帧调 resolveTargetFromSnapshot 更新 dragSnap
//   5. pointerup → executeIntent 提交变更 + 重置
//
// 浮卡: 固定定位 div 跟随指针，不再是 DragOverlay
// ============================================================================

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { log } from "../lib/draglog";
import { Home, Plus } from "lucide-react";

import {
  createEmptySnapshot,
  computeDragPreview,
  deriveOntoGroupId,
  resolveIntent,
  executeIntent,
  captureHeights,
  resolveTargetFromSnapshot,
} from "../lib/drag";
import type { DragSnapshot, HeightMap } from "../lib/drag";

import { SortableTreeItem } from "./SortableTreeItem";
import { OverlayCard } from "./OverlayCard";

// ---------- 常量 ----------

const AUTO_EXPAND_DELAY = 400;
const LONG_PRESS_MS = 300;       // 长按触发拖拽
const MOVE_TOLERANCE_PX = 5;    // 容忍的移动距离

// ---------- 类型 ----------

interface DragHandleState {
  sourceId: string | null;       // 被拖拽项的 ID
  startX: number;
  startY: number;
  pointerId: number;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;               // 拖拽已激活?
}

// ============================================================================
// ProjectList 组件
// ============================================================================

export function ProjectList() {
  const t = useT();

  // ─── Zustand store ───
  const projects = useAppStore((s) => s.projects);
  const groups = useAppStore((s) => s.groups);
  const savedSelected = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const addProject = useAppStore((s) => s.addProject);
  const openCreateProject = useAppStore((s) => s.openCreateProject);
  const reorderAll = useAppStore((s) => s.reorderAll);
  const createGroup = useAppStore((s) => s.createGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const toggleGroup = useAppStore((s) => s.toggleGroup);
  const batchMoveAndReorder = useAppStore((s) => s.batchMoveAndReorder);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadGroups = useAppStore((s) => s.loadGroups);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => { loadProjects(); loadGroups(); loadSettings(); }, []);

  // ─── 局部 UI 状态 ───
  const [filter, setFilter] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // ─── 拖拽状态 ───
  const [dragSnap, setDragSnap] = useState<DragSnapshot>(createEmptySnapshot());
  const snapRef = useRef(dragSnap);
  snapRef.current = dragSnap;

  // pointer handle 状态
  const handleRef = useRef<DragHandleState>({
    sourceId: null, startX: 0, startY: 0, pointerId: -1, timer: null, active: false,
  });

  // 浮卡位置 (X 轴锁死在拖拽起点，仅 Y 随指针)
  const [overlayY, setOverlayY] = useState<number | null>(null);
  const overlayXRef = useRef<number>(0);

  // 快照 refs
  const heightMapRef = useRef<HeightMap>(new Map());
  const containerTopRef = useRef<number>(0);

  // 自动展开计时器
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandTargetRef = useRef<string | null>(null);

  const isDragging = dragSnap.phase === "dragging";

  // ─── 派生数据 ───
  const displayTree = useMemo(
    () => computeDragPreview(projects, groups, dragSnap),
    [projects, groups, dragSnap]
  );
  const itemMap = useMemo(
    () => new Map(displayTree.map((i) => [i.id, i])),
    [displayTree]
  );

  const listRef = useRef<HTMLDivElement>(null);

  // ─── 辅助 ───
  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null; }
    autoExpandTargetRef.current = null;
  };

  // itemVisible (折叠/过滤)
  const itemVisible = useMemo(() => {
    const map = new Map<string, boolean>();
    let skipGroup: string | null = null;
    for (const item of displayTree) {
      if (item.type === "group-slot") { map.set(item.id, true); }
      else if (item.type === "group-header") { map.set(item.id, true); skipGroup = item.groupCollapsed ? item.groupId! : null; }
      else {
        const inCollapsed = !!skipGroup && item.project?.group_id === skipGroup;
        const filteredOut = !!filter && !item.project?.name.toLowerCase().includes(filter.toLowerCase());
        map.set(item.id, !inCollapsed && !filteredOut);
      }
    }
    const emptyGroups = new Set<string>();
    for (const item of displayTree) {
      if (item.type === "group-header" && !item.groupCollapsed && item.groupId) emptyGroups.add(item.groupId);
    }
    for (const item of displayTree) {
      if (item.type === "project" && item.project?.group_id && map.get(item.id)) emptyGroups.delete(item.project.group_id);
    }
    for (const gid of emptyGroups) map.set(gid, false);
    return map;
  }, [displayTree, filter]);

  // ─── 高度快照补漏: displayTree 新增元素时补入 heightMap ───
  // 拖拽开始后 group-slot 和自动展开的项目才进入 DOM，需要追加高度
  useEffect(() => {
    if (!isDragging) return;
    const container = listRef.current;
    if (!container) return;
    const map = heightMapRef.current;
    let changed = false;
    for (const item of displayTree) {
      if (map.has(item.id)) continue;
      if (item.type === "group-slot") {
        map.set(item.id, 42);           // 40px + 2px margin (GroupSlotItem)
        changed = true;
      } else {
        const el = container.querySelector<HTMLElement>(`[data-dnd-item-id="${item.id}"]`);
        if (el) { map.set(item.id, el.getBoundingClientRect().height); changed = true; }
      }
    }
    if (changed) heightMapRef.current = new Map(map);  // 触发 ref 不变但内容已更新
  }, [displayTree, isDragging]);
  const updSnap = useCallback((patch: Partial<DragSnapshot>) => {
    setDragSnap((prev) => {
      const next = { ...prev, ...patch };
      const intent = resolveIntent(next);
      return intent !== prev.intent ? { ...next, intent } : next;
    });
  }, []);

  // ========================================================================
  // 拖拽帧逻辑 (替代 dnd-kit 的 onDragOver)
  // ========================================================================
  const processDragFrame = useCallback((pointerY: number) => {
    const h = handleRef.current;
    if (!h.active || !h.sourceId) return;

    const ct = containerTopRef.current;
    const st = listRef.current?.scrollTop ?? 0;
    const contentY = pointerY - ct + st;

    console.log(
      "[DRAG-FRAME]",
      `py=${pointerY.toFixed(0)}`, `ct=${ct.toFixed(0)}`, `st=${st}`,
      `cY=${contentY.toFixed(0)}`, `treeLen=${displayTree.length}`,
    );

    // zone 判定用 displayTree（预览树）——与用户看到的视觉位置一致
    const resolved = resolveTargetFromSnapshot(
      heightMapRef.current, displayTree, pointerY, ct, st, h.sourceId
    );

    console.log(
      "[DRAG-RESOLVE]",
      resolved
        ? `hit=${resolved.targetId.slice(0, 8)} zone=${resolved.zone} idx=${resolved.targetIdx}`
        : "null",
    );

    if (!resolved) {
      clearAutoExpandTimer();
      updSnap({ targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null });
      return;
    }

    const { targetId, targetIdx, zone } = resolved;
    const targetItem = itemMap.get(targetId) ?? null;
    const snap = snapRef.current;
    const srcGroupId = snap.sourceItem?.project?.group_id ?? snap.sourceItem?.groupId ?? null;
    const ontoGroupId = deriveOntoGroupId(zone, targetItem, srcGroupId);

    // 悬停折叠分组自动展开
    if (targetItem?.type === "group-header" && targetItem.groupCollapsed) {
      if (autoExpandTargetRef.current !== targetId) {
        autoExpandTargetRef.current = targetId;
        clearAutoExpandTimer();
        autoExpandTimerRef.current = setTimeout(() => {
          if (targetItem.groupId) { toggleGroup(targetItem.groupId, false); }
          autoExpandTimerRef.current = null;
          autoExpandTargetRef.current = null;
        }, AUTO_EXPAND_DELAY);
      }
    } else {
      clearAutoExpandTimer();
    }

    if (snap.targetId === targetId && snap.zone === zone && snap.ontoGroupId === ontoGroupId) return;

    updSnap({ targetId, targetItem, targetIdx, zone, ontoGroupId });
  }, [displayTree, itemMap, updSnap, toggleGroup]);

  // ========================================================================
  // pointerdown → 启动长按检测
  // ========================================================================
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 只在 grip handle 上触发
    const grip = (e.target as HTMLElement).closest("[data-drag-handle]");
    if (!grip) return;

    const itemEl = (e.target as HTMLElement).closest("[data-dnd-item-id]") as HTMLElement | null;
    const itemId = itemEl?.getAttribute("data-dnd-item-id");
    if (!itemId) return;

    // 过滤模式下不允许拖拽
    if (!!filter) return;

    const h = handleRef.current;
    h.sourceId = itemId;
    h.startX = e.clientX;
    h.startY = e.clientY;
    h.pointerId = e.pointerId;
    h.active = false;

    // 清除旧计时器
    if (h.timer) clearTimeout(h.timer);

    // 300ms 长按触发
    h.timer = setTimeout(() => {
      const h2 = handleRef.current;
      if (h2.sourceId !== itemId) return; // 已取消
      h2.active = true;

      // 建快照
      if (listRef.current) {
        heightMapRef.current = captureHeights(listRef.current);
        containerTopRef.current = listRef.current.getBoundingClientRect().top;
        // 手工补入 group-slot 高度（slot 拖拽开始后才注入 DOM，快照时还不存在）
        const src = projects.find((p) => p.id === itemId);
        if (src?.group_id) {
          const g = groups.find((grp) => grp.id === src.group_id);
          if (g && !g.collapsed) {
            heightMapRef.current.set(`slot-${src.group_id}`, 42);
          }
        }
      }

      const item = itemMap.get(itemId);
      const idx = displayTree.findIndex((it) => it.id === itemId);
      log.dragStart(itemId, idx,
        item?.type === "project" ? item.project?.group_id : item?.groupId,
        displayTree.map((it) => ({ id: it.id, type: it.type, gid: it.project?.group_id ?? it.groupId ?? null }))
      );

      updSnap({
        phase: "dragging", sourceId: itemId,
        sourceItem: item ?? null, sourceIdx: idx,
        targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null,
      });

      setOverlayY(h2.startY);
      overlayXRef.current = h2.startX;
      h2.timer = null;

      // 捕获指针 (确保 pointermove/up 事件继续到达)
      try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    }, LONG_PRESS_MS);
  }, [filter, itemMap, displayTree, updSnap]);

  // ========================================================================
  // window pointermove → 更新浮卡 + 处理拖拽帧
  // ========================================================================
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const h = handleRef.current;

      if (!h.active) {
        // 检测阶段: 超过容差则取消
        if (h.sourceId && h.timer) {
          const dx = e.clientX - h.startX;
          const dy = e.clientY - h.startY;
          if (Math.abs(dx) > MOVE_TOLERANCE_PX || Math.abs(dy) > MOVE_TOLERANCE_PX) {
            clearTimeout(h.timer);
            h.timer = null;
            h.sourceId = null;
          }
        }
        return;
      }

      // 激活拖拽中: 更新浮卡 Y + 处理帧
      setOverlayY(e.clientY);
      processDragFrame(e.clientY);
    };

    const onUp = () => {
      const h = handleRef.current;
      if (h.timer) { clearTimeout(h.timer); h.timer = null; }

      if (!h.active) {
        h.sourceId = null;
        return;
      }

      // 拖拽结束
      const snap = snapRef.current;
      clearAutoExpandTimer();

      if (snap.phase === "dragging" && snap.sourceId && snap.targetId && snap.zone) {
        executeIntent(snap.intent, snap, displayTree, projects, groups, {
          reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t,
        });
      }

      // 重置
      h.active = false;
      h.sourceId = null;
      h.pointerId = -1;
      setOverlayY(null);
      setDragSnap(createEmptySnapshot());
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // 清理长按计时器，防止组件卸载后触发 setState
      if (handleRef.current.timer) {
        clearTimeout(handleRef.current.timer);
        handleRef.current.timer = null;
      }
    };
  }, [displayTree, projects, groups, processDragFrame, reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t]);

  // ─── 分组重命名 ───
  const handleGroupRename = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    setEditingGroupId(gid);
    setEditName(g.name);
  };
  const commitRename = () => {
    if (editingGroupId && editName.trim()) renameGroup(editingGroupId, editName.trim());
    setEditingGroupId(null);
  };

  // ─── 浏览文件夹 ───
  const handleAdd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: t.selectFolderTitle });
      if (dir) { const n = dir.split(/[\\/]/).pop() || t.unnamed; await addProject(n, dir as string); }
    } catch (e) { console.error("Failed to add project:", e); }
  };

  // ─── 浮卡 ───
  const activeItem = isDragging && dragSnap.sourceId ? itemMap.get(dragSnap.sourceId) : null;

  // ========================================================================
  // 渲染
  // ========================================================================
  return (
    <>
      <aside style={{ width: 260, background: "var(--color-base)", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid var(--color-hover)", position: "relative" }}>
        {/* 标题栏 */}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{t.projectListTitle}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={openCreateProject} title={t.newProject} style={{ background: "none", border: "none", color: "var(--color-primary-fg)", cursor: "pointer", lineHeight: 1, display: "flex" }}><Plus size={18} strokeWidth={1.5} /></button>
            <button onClick={handleAdd} title="Browse folder" style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", lineHeight: 1 }}><Plus size={18} strokeWidth={1.5} /></button>
          </div>
        </div>

        {/* 搜索 */}
        <input type="text" placeholder={t.filterPlaceholder} value={filter} onChange={(e) => !isDragging && setFilter(e.target.value)}
          style={{ margin: "0 12px 8px", background: "var(--color-card)", color: "var(--color-text-secondary)", border: "none", padding: "7px 12px", fontSize: 12, outline: "none" }} />

        {/* 列表 + pointerdown 事件委托 */}
        <div ref={listRef} onPointerDown={handlePointerDown}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0", touchAction: "none" }}>
          <div onClick={() => selectProject(null)}
            style={{ padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.6 }}
            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = "var(--color-hover)"; e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.6"; }}>
            <Home size={16} strokeWidth={1.5} /><span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
          </div>

          {displayTree.map((item, idx) => (
            <SortableTreeItem key={item.id} id={item.id} index={idx} item={item}
              visible={itemVisible.get(item.id) !== false}
              activeId={dragSnap.sourceId}
              dragZone={dragSnap.zone} dragTargetId={dragSnap.targetId} ontoGroupId={dragSnap.ontoGroupId}
              savedSelected={savedSelected} filterActive={!!filter && !isDragging}
              editingGroupId={editingGroupId} editName={editName} setEditName={setEditName} commitRename={commitRename}
              handleGroupRename={handleGroupRename} toggleGroup={toggleGroup} selectProject={selectProject}
              projects={projects} />
          ))}
        </div>

        {/* 底部状态 */}
        <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
          {isDragging ? "Drop to reorder / group" : t.projectCount(projects.length)}
        </div>
      </aside>

      {/* 浮卡: X 锁死在拖拽起点，仅 Y 跟随指针 */}
      {overlayY !== null && activeItem && (
        <div style={{
          position: "fixed", left: overlayXRef.current + 12, top: overlayY + 8,
          zIndex: 9999, pointerEvents: "none",
        }}>
          <OverlayCard item={activeItem} ontoGroupId={dragSnap.ontoGroupId} dragZone={dragSnap.zone}
            groups={groups} projects={projects} itemMap={itemMap} dragTargetId={dragSnap.targetId} />
        </div>
      )}
    </>
  );
}
