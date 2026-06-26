// ============================================================================
// 文件 8/10: src/components/ProjectList.tsx — 阅读顺序第 8 位
// 作用: 侧边栏容器 — 连接拖拽状态机、预览树、Zustand store 和渲染子组件
//
// ─── React 核心概念（C++/Python 对照）───
//
// 组件 (Component):
//   function ProjectList() { ... return <JSX/>; }
//   返回 JSX（类 HTML 的语法糖），React 将其渲染为 DOM。
//   每次 state/props 变化，React 重新执行该函数 → 生成新 JSX → 对比 DOM → 增量更新。
//   类比: 类似游戏引擎的 update() 循环，但 React 自动 diff。
//
// Hooks (钩子函数):
//   useState(init):      [value, setter] 组件局部状态。setter 触发重新渲染。
//                         类似: 带有"修改时通知"功能的局部变量
//   useMemo(fn, deps):   只有 deps 变化时才重新计算 fn()，否则返回缓存值。
//                         类似: Python @lru_cache / C++ lazy evaluation
//   useCallback(fn, deps):类似 useMemo，但缓存的是函数本身。
//                         用于避免子组件因函数引用变化而无效重渲染。
//   useRef(init):        可变容器，修改不触发渲染。常用于保存 DOM 引用或上一帧的值。
//   useEffect(fn, deps): DOM 更新后异步执行 fn（用于副作用：API 调用、事件订阅）
//
// 数据流:
//   store (projects, groups) → displayTree (computeDragPreview) → FLIP 动画 → 渲染
//   用户拖拽 → dnd-kit 事件 → updSnap(DragSnapshot) → 重新计算 displayTree → 循环
// ============================================================================

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore } from "../lib/store";    // Zustand store
import { useT } from "../lib/i18n";            // 国际化翻译 hook
import { log } from "../lib/draglog";          // 开发调试日志
import { Home, Plus } from "lucide-react";     // 图标库
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";

import {
  createEmptySnapshot,
  computeDragPreview,           // 预览树纯函数
  deriveOntoGroupId,            // 推导目标分组 ID
  resolveIntent,                // 意图推导
  executeIntent,                // 意图执行
  useFlipAnimation,             // FLIP 动画
  captureHeights,               // 拖拽开始时记录所有元素高度
  resolveTargetFromSnapshot,    // 纯数学推算命中目标 (不查 DOM)
} from "../lib/drag";
import type { DragSnapshot, HeightMap } from "../lib/drag";

import { SortableTreeItem } from "./SortableTreeItem";
import { OverlayCard } from "./OverlayCard";

const AUTO_EXPAND_DELAY = 400;  // 悬停折叠分组 400ms 后自动展开

// ===========================================================================
// ProjectList 组件: 侧边栏的主体
// ===========================================================================
export function ProjectList() {
  const t = useT();

  // ─── 从 Zustand store 订阅数据 ───
  // useAppStore(selector): 选择性地订阅 store 中的字段
  // selector 返回简单值 → 只有该值变化时才重新渲染
  // selector 返回函数 → 该函数引用稳定（Zustand 保证），不会导致额外渲染
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

  // ─── 初始化: 组件挂载时从 Rust 后端加载数据 ───
  // useEffect(fn, []): 仅首次渲染后执行（空数组 = 不依赖任何值）
  useEffect(() => { loadProjects(); loadGroups(); loadSettings(); }, []);

  // ─── 局部 UI 状态（不属于 store 的临时状态） ───
  const [filter, setFilter] = useState("");                          // 搜索过滤文字
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);  // 正在重命名的分组
  const [editName, setEditName] = useState("");                     // 重命名输入内容

  // ─── 拖拽状态: 单一数据源 ───
  // dragSnap: 当前拖拽状态快照
  // setDragSnap: 更新快照（触发重新渲染 → 重新计算 displayTree）
  const [dragSnap, setDragSnap] = useState<DragSnapshot>(createEmptySnapshot());

  // snapRef: 用于在回调闭包中读取最新的 dragSnap
  // 为什么需要 ref? 因为 handleDragOver/End 被 useCallback 包装，
  // 闭包可能捕获过期的 dragSnap。ref 总是指向最新值。
  const snapRef = useRef(dragSnap);
  snapRef.current = dragSnap;

  // 自动展开计时器
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandTargetRef = useRef<string | null>(null);

  // 高度快照: 拖拽开始时一次性记录所有元素高度，拖拽中不查 DOM
  const heightMapRef = useRef<HeightMap>(new Map());
  const containerTopRef = useRef<number>(0);

  // activeDragRef: 在 handleDragStart 中立即写入，不被 React 渲染周期延迟
  // handleDragOver 在渲染之前就能读到 sourceId，避免早退
  const activeDragRef = useRef<{ sourceId: string } | null>(null);

  const isDragging = dragSnap.phase === "dragging";

  // ─── displayTree: 核心派生数据 ───
  // useMemo: 只有 projects/groups/dragSnap 变化时才重新调用 computeDragPreview
  // computeDragPreview 是纯函数 → 性能可预测
  const displayTree = useMemo(
    () => computeDragPreview(projects, groups, dragSnap),
    [projects, groups, dragSnap]
  );

  // itemMap: 快速按 ID 查找 TreeItem（避免每次线性搜索）
  const itemMap = useMemo(
    () => new Map(displayTree.map((i) => [i.id, i])),
    [displayTree]
  );

  // ─── FLIP 动画 hook ───
  const listRef = useRef<HTMLDivElement>(null);
  useFlipAnimation(listRef, displayTree);  // displayTree 变化时自动 FLIP

  // ─── 辅助函数 ───
  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    autoExpandTargetRef.current = null;
  };

  // itemVisible: 计算每个 TreeItem 是否可见（折叠/过滤）
  const itemVisible = useMemo(() => {
    const map = new Map<string, boolean>();
    let skipGroup: string | null = null;  // 当前折叠的分组
    for (const item of displayTree) {
      if (item.type === "group-slot") {
        map.set(item.id, true);
      } else if (item.type === "group-header") {
        map.set(item.id, true);
        skipGroup = item.groupCollapsed ? item.groupId! : null;
      } else {
        const inCollapsed = !!skipGroup && item.project?.group_id === skipGroup;
        const filteredOut = !!filter && !item.project?.name.toLowerCase().includes(filter.toLowerCase());
        map.set(item.id, !inCollapsed && !filteredOut);
      }
    }
    // 隐藏空分组（所有项目都被过滤掉的分组）
    const emptyGroups = new Set<string>();
    for (const item of displayTree) {
      if (item.type === "group-header" && !item.groupCollapsed && item.groupId) {
        emptyGroups.add(item.groupId);
      }
    }
    for (const item of displayTree) {
      if (item.type === "project" && item.project?.group_id && map.get(item.id)) {
        emptyGroups.delete(item.project.group_id);
      }
    }
    for (const gid of emptyGroups) {
      map.set(gid, false);
    }
    return map;
  }, [displayTree, filter]);

  // ─── dnd-kit 传感器配置 ───
  // PointerSensor: 基于指针事件的拖拽传感器
  // Delay(300ms, 5px): 长按 300ms 且移动 >5px 才触发拖拽（避免点击误触）
  const pointerSensor = useMemo(() => PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Delay({ value: 300, tolerance: 5 })],
  }), []);

  // ─── updSnap: 更新拖拽快照的便捷方法 ───
  // 接受 DragSnapshot 的部分字段，内部自动合并 + 重新计算 intent
  const updSnap = useCallback((patch: Partial<DragSnapshot>) => {
    setDragSnap((prev) => {
      const next = { ...prev, ...patch };
      // 如果 intent 变化了，同步更新
      const intent = resolveIntent(next);
      return intent !== prev.intent ? { ...next, intent } : next;
    });
  }, []);

  // ─── handleDragStart: 拖拽开始 ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragStart = useCallback((e: any) => {
    const sourceId = e.operation?.source?.id;  // dnd-kit 事件: 被拖拽项的 ID
    if (!sourceId) return;
    clearAutoExpandTimer();

    // 一次性建立高度快照 + 记录容器位置
    if (listRef.current) {
      heightMapRef.current = captureHeights(listRef.current);
      containerTopRef.current = listRef.current.getBoundingClientRect().top;
      import.meta.env.DEV && console.log(
        "[DRAG-SNAP]",
        `containerTop=${containerTopRef.current.toFixed(0)}`,
        `scrollTop=${listRef.current.scrollTop}`,
        `itemCount=${heightMapRef.current.size}`,
      );
    }

    // 立即记录 sourceId（不等 React 渲染），确保 handleDragOver 可读
    activeDragRef.current = { sourceId };

    const item = itemMap.get(sourceId);
    const idx = displayTree.findIndex((it) => it.id === sourceId);
    const srcGroup = item?.type === "project" ? item.project?.group_id : item?.groupId;
    log.dragStart(sourceId, idx, srcGroup,
      displayTree.map((it) => ({ id: it.id, type: it.type, gid: it.project?.group_id ?? it.groupId ?? null }))
    );
    updSnap({
      phase: "dragging",
      sourceId,
      sourceItem: item ?? null,
      sourceIdx: idx,
      targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null,
    });
  }, [displayTree, itemMap, updSnap]);

  // ─── handleDragOver: 拖拽经过（每帧触发） ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragOver = useCallback((e: any) => {
    // 用 activeDragRef 而非 snapRef: 不受 React 渲染延迟影响
    const drag = activeDragRef.current;
    if (!drag) return;

    const pointerY: number | undefined = e.operation?.position?.y;
    if (pointerY === undefined) return;

    const sourceIdx = displayTree.findIndex((it) => it.id === drag.sourceId);
    const ct = containerTopRef.current;
    const st = listRef.current?.scrollTop ?? 0;
    const contentY = pointerY - ct + st;

    // 每帧入口日志: 确认拖拽被正常捕获
    import.meta.env.DEV && console.log(
      "[DRAG-FRAME]",
      `py=${pointerY.toFixed(0)}`,
      `ct=${ct.toFixed(0)}`,
      `st=${st}`,
      `cY=${contentY.toFixed(0)}`,
      `srcIdx=${sourceIdx}`,
      `treeLen=${displayTree.length}`,
    );

    // 纯数学推算: 用快照高度 + 预览树顺序计算命中目标
    const resolved = resolveTargetFromSnapshot(
      heightMapRef.current,
      displayTree,
      pointerY,
      ct,
      st,
      sourceIdx
    );

    import.meta.env.DEV && console.log(
      "[DRAG-RESOLVE]",
      resolved
        ? `hit=${resolved.targetId.slice(0,8)} zone=${resolved.zone} idx=${resolved.targetIdx}`
        : "null (pointer outside all items)",
    );

    if (!resolved) {
      clearAutoExpandTimer();
      log.dragOverNull();
      updSnap({ targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null });
      return;
    }

    const { targetId, targetIdx, zone } = resolved;
    const targetItem = itemMap.get(targetId) ?? null;

    log.dragOverTarget("snapshot", targetId, targetItem?.type, zone,
      deriveOntoGroupId(zone, targetItem),
      // ratio 不再从 DOM 取，用 0 占位
      0);

    // deriveOntoGroupId: 推导目标分组 ID（用于高亮和 badge）
    const ontoGroupId = deriveOntoGroupId(zone, targetItem);

    // 悬停折叠分组 → 400ms 后自动展开
    if (targetItem?.type === "group-header" && targetItem.groupCollapsed) {
      if (autoExpandTargetRef.current !== targetId) {
        autoExpandTargetRef.current = targetId;
        clearAutoExpandTimer();
        autoExpandTimerRef.current = setTimeout(() => {
          if (targetItem.groupId) { toggleGroup(targetItem.groupId, false); log.autoExpand(targetItem.groupId, true); }
          autoExpandTimerRef.current = null;
          autoExpandTargetRef.current = null;
        }, AUTO_EXPAND_DELAY);
      }
    } else {
      clearAutoExpandTimer();
    }

    // 避免无意义的 setState（如果数据没变，跳过）
    const snap = snapRef.current;
    if (snap.targetId === targetId && snap.zone === zone && snap.ontoGroupId === ontoGroupId) return;

    updSnap({ targetId, targetItem, targetIdx, zone, ontoGroupId });
  }, [displayTree, itemMap, updSnap, toggleGroup]);

  // ─── handleDragEnd: 拖拽结束 → 执行语义操作 ───
  const handleDragEnd = useCallback(() => {
    const snap = snapRef.current;
    clearAutoExpandTimer();
    activeDragRef.current = null;  // 清除拖拽源标记

    // 有效拖拽: 有源 + 有目标 + 有 zone → 执行 executeIntent
    if (snap.phase === "dragging" && snap.sourceId && snap.targetId && snap.zone) {
      executeIntent(
        snap.intent,
        snap,
        displayTree,
        projects,
        groups,
        { reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t }
      );
    }

    // 重置拖拽状态（任何情况都重置）
    setDragSnap(createEmptySnapshot());
  }, [displayTree, projects, groups, reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t]);

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

  // ─── 浏览文件夹添加项目 ───
  const handleAdd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: t.selectFolderTitle });
      if (dir) { const n = dir.split(/[\\/]/).pop() || t.unnamed; await addProject(n, dir as string); }
    } catch (e) { console.error("Failed to add project:", e); }
  };

  // 拖拽浮卡: 被拖拽项的数据
  const activeItem = isDragging && dragSnap.sourceId ? itemMap.get(dragSnap.sourceId) : null;

  // ─── JSX 渲染 ───
  return (
    // DragDropProvider: dnd-kit 的上下文容器，管理所有拖拽操作
    <DragDropProvider
      plugins={(defaults) => [...defaults, pointerSensor]}  // 注册传感器
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <aside style={{ width: 260, background: "var(--color-base)", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid var(--color-hover)", position: "relative" }}>
        {/* 标题栏 + 添加按钮 */}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{t.projectListTitle}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={openCreateProject} title={t.newProject} style={{ background: "none", border: "none", color: "var(--color-primary-fg)", cursor: "pointer", lineHeight: 1, display: "flex" }}><Plus size={18} strokeWidth={1.5} /></button>
            <button onClick={handleAdd} title="Browse folder" style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", lineHeight: 1 }}><Plus size={18} strokeWidth={1.5} /></button>
          </div>
        </div>

        {/* 搜索过滤 */}
        <input type="text" placeholder={t.filterPlaceholder} value={filter} onChange={(e) => !isDragging && setFilter(e.target.value)}
          style={{ margin: "0 12px 8px", background: "var(--color-card)", color: "var(--color-text-secondary)", border: "none", padding: "7px 12px", fontSize: 12, outline: "none" }} />

        {/* 项目列表（可滚动 + FLIP 动画容器） */}
        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0" }}>
          {/* Home 入口（不可拖拽） */}
          <div onClick={() => selectProject(null)}
            style={{ padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.6 }}
            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = "var(--color-hover)"; e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.6"; }}>
            <Home size={16} strokeWidth={1.5} /><span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
          </div>

          {/* displayTree 中的每个元素都渲染为一个 SortableTreeItem */}
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

        {/* 底部状态栏 */}
        <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
          {isDragging ? "Drop to reorder / group" : t.projectCount(projects.length)}
        </div>
      </aside>

      {/* DragOverlay: 拖拽时显示的浮动卡片 */}
      <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
        {activeItem && <OverlayCard item={activeItem} ontoGroupId={dragSnap.ontoGroupId} dragZone={dragSnap.zone} groups={groups} projects={projects} itemMap={itemMap} dragTargetId={dragSnap.targetId} />}
      </DragOverlay>
    </DragDropProvider>
  );
}
