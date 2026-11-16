import { useEffect, useState } from "react";

interface GlassHandle {
  supported: boolean;
  refresh: () => void;
  destroy: () => void;
}
declare global {
  interface Window {
    liquidGlass?: (
      element: HTMLElement,
      options?: {
        scale?: number;
        chroma?: number;
        blur?: number;
        border?: number;
        saturate?: number;
        fallbackBlur?: number;
      },
    ) => GlassHandle;
  }
}

/** Lifecycle adapter for the pinned deepika-builds/liquid-glass implementation. */
export function useLiquidGlass<T extends HTMLElement>() {
  const [element, attach] = useState<T | null>(null);
  useEffect(() => {
    if (!element || !window.liquidGlass) return;
    if (
      matchMedia("(forced-colors: active)").matches ||
      matchMedia("(prefers-reduced-transparency: reduce)").matches
    ) {
      element.dataset.glassRenderer = "solid";
      return;
    }
    // shortcut: large panels use frosted CSS; keep GPU refraction maps under the upstream 800px guidance.
    if (element.offsetWidth > 800 || element.offsetHeight > 800) {
      element.dataset.glassRenderer = "frosted";
      return;
    }
    const glass = window.liquidGlass(element, {
      scale: element.classList.contains("mobile-dock") ? -90 : -42,
      chroma: element.classList.contains("mobile-dock") ? 5 : 2,
      blur: element.classList.contains("mobile-dock") ? 4 : 14,
      border: 0.12,
      saturate: 1.35,
      fallbackBlur: element.classList.contains("mobile-dock") ? 12 : 20,
    });
    element.dataset.glassRenderer = glass.supported ? "refraction" : "frosted";
    return () => {
      glass.destroy();
      delete element.dataset.glassRenderer;
    };
  }, [element]);
  return attach;
}
