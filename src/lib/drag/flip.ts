import { useRef, useLayoutEffect } from "react";
import type { TreeItem } from "../store";

export function useFlipAnimation(
  containerRef: React.RefObject<HTMLElement | null>,
  items: TreeItem[]
) {
  const positionsRef = useRef<Map<string, number>>(new Map());
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const newPositions = new Map<string, number>();
    const currentNodes = new Map<string, HTMLElement>();

    container.querySelectorAll<HTMLElement>("[data-dnd-item-id]").forEach((el) => {
      const id = el.getAttribute("data-dnd-item-id");
      if (id) {
        newPositions.set(id, el.getBoundingClientRect().top);
        currentNodes.set(id, el);
      }
    });

    nodesRef.current = currentNodes;

    let needsAnimation = false;

    currentNodes.forEach((el, id) => {
      const prev = positionsRef.current.get(id);
      const next = newPositions.get(id);
      if (prev != null && next != null && Math.abs(prev - next) > 0.5) {
        const delta = prev - next;
        el.style.transform = `translateY(${delta}px)`;
        el.style.transition = "none";
        needsAnimation = true;
      }
    });

    if (needsAnimation) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          currentNodes.forEach((el) => {
            el.style.transition = "transform 0.2s ease";
            el.style.transform = "";
          });
        });
      });
    }

    positionsRef.current = newPositions;
  }, [items, containerRef]);
}
