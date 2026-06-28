// ============================================================================
// 文件 7/10: src/lib/drag/flip.ts — 阅读顺序第 7 位
// 作用: FLIP 动画 hook — 预览树变化时平滑过渡位置
//
// 新增 TS/React 语法:
//   useRef<T>(initial):     创建可变引用，.current 值在渲染间持久存在
//                           修改 .current 不会触发重新渲染（类似 C++ 成员变量）
//   useLayoutEffect(fn, [deps]):
//                           在 DOM 变更后、浏览器绘制前同步执行 fn
//                           比 useEffect 早，避免闪烁。类似"帧回调"
//   requestAnimationFrame(fn):
//                           浏览器在下一帧绘制前调用 fn（用于动画时序）
//   querySelectorAll(sel):  DOM 查询，返回匹配所有元素的 NodeList
//   getBoundingClientRect(): DOM 方法，返回元素的位置和尺寸
//   Map<K, V>:              键值对容器（类似 C++ map / Python dict）
//
// FLIP 技术原理（First-Last-Invert-Play）:
//   1. First:  记录元素当前的位置 (getBoundingClientRect)
//   2. Last:   渲染变化 → 记录新位置
//   3. Invert: 用 transform 把元素"倒回"旧位置 (translateY(delta))
//   4. Play:   移除 transform，让 CSS transition 动画到新位置
//
// 为什么不用 dnd-kit 自带的动画?
//   因为我们在 useSortable 中设了 disabled: true，禁用了 dnd-kit 的自动重排，
//   所以需要自己实现位置过渡动画。FLIP 是最简洁的方案。
// ============================================================================

import { useRef, useLayoutEffect } from "react";
import type { TreeItem } from "../store";

export function useFlipAnimation(
  containerRef: React.RefObject<HTMLElement | null>,  // 列表容器的 ref
  items: TreeItem[]                                    // 当前渲染的树
) {
  // positionsRef: 记录上一次渲染时每个元素的位置
  // key = 元素 ID (data-dnd-item-id), value = top 坐标
  const positionsRef = useRef<Map<string, number>>(new Map());

  // nodesRef: 记录当前 DOM 中的元素引用
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());

  // useLayoutEffect: items 变化时触发 → DOM 已更新但尚未绘制
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ─── Step 1 & 2: 记录新位置 ───
    const newPositions = new Map<string, number>();
    const currentNodes = new Map<string, HTMLElement>();

    // 查找容器内所有带 data-dnd-item-id 属性的元素
    container.querySelectorAll<HTMLElement>("[data-dnd-item-id]").forEach((el) => {
      const id = el.getAttribute("data-dnd-item-id");
      if (id) {
        newPositions.set(id, el.getBoundingClientRect().top);  // 记录 top 坐标
        currentNodes.set(id, el);                               // 缓存元素引用
      }
    });

    nodesRef.current = currentNodes;

    // ─── Step 3: Invert — 把元素倒回旧位置 ───
    let needsAnimation = false;

    currentNodes.forEach((el, id) => {
      const prev = positionsRef.current.get(id);  // 旧位置
      const next = newPositions.get(id);           // 新位置

      // 只处理位置有明显变化的元素（>0.5px 阈值避免浮点抖动）
      if (prev != null && next != null && Math.abs(prev - next) > 0.5) {
        const delta = prev - next;                  // 旧位置 - 新位置
        el.style.transform = `translateY(${delta}px)`;  // 倒回旧位置
        el.style.transition = "none";               // 关过渡 → 瞬间到位
        needsAnimation = true;
      }
    });

    // ─── Step 4: Play — 动画到新位置 ───
    if (needsAnimation) {
      // 双重 rAF: 确保浏览器先绘制"倒回"后的状态，再开始过渡
      // 第一个 rAF: 浏览器在下一帧处理 transform: translateY(delta)
      // 第二个 rAF: 在上一个处理完成后，再移除 transform → CSS transition 生效
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          currentNodes.forEach((el) => {
            el.style.transition = "transform 0.2s ease";  // 0.2s 过渡
            el.style.transform = "";                       // 清除 transform → 动画到原位
          });
        });
      });
    }

    // 保存新位置供下次对比
    positionsRef.current = newPositions;
  }, [items, containerRef]);  // items 或 containerRef 变化时重新执行
}
