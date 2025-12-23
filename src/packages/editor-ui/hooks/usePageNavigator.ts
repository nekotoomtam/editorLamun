"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageJson } from "../../editor-core/schema";

type Behavior = "jump" | "smooth" | "auto";

export type NavigateSource = "pagesPanel" | "thumbs" | "canvas" | "system";

export type PageMetrics = {
    offsets: number[];
    heights: number[];
};

export type ScrollToPageFn = (pageId: string, behavior?: "auto" | "smooth") => void;

export type UsePageNavigatorArgs = {
    mode: "single" | "scroll";
    pages: PageJson[];
    pageMetrics: PageMetrics;
    zoom: number;

    // scroll root
    rootEl: HTMLElement | null;

    // from your existing hook
    scrollToPage: ScrollToPageFn;
    markManualSelect: () => void;
    lastManualSelectAtRef: React.MutableRefObject<number>;

    // external state
    activePageId: string | null;
    setActivePageId?: (pageId: string) => void;

    // reporting to left panel
    onViewingPageIdChange?: (pageId: string | null) => void;

    // preload callback (optional)
    ensureAround?: (pageId: string, radius: number) => void;

    // render window radius
    preloadRadius?: number;
    isProgrammaticScrollRef: React.MutableRefObject<boolean>;
};

export function usePageNavigator({
    mode,
    pages,
    pageMetrics,
    zoom,
    rootEl,
    scrollToPage,
    markManualSelect,
    lastManualSelectAtRef,
    activePageId,
    setActivePageId,
    onViewingPageIdChange,
    ensureAround,
    preloadRadius = 2,
    isProgrammaticScrollRef
}: UsePageNavigatorArgs) {
    // -------- Viewing (viewport) --------
    const [viewportAnchorIndex, setViewportAnchorIndex] = useState(0);

    // Hysteresis tuning
    const REF_RATIO = 0.6;
    const ENTER_RATIO = 0.12;
    const ENTER_MIN_PX = 140;

    // -------- Navigation control (the "coordinator") --------

    const [forcedAnchorIndex, setForcedAnchorIndex] = useState<number | null>(null);
    const forcedTargetRef = useRef<number | null>(null);
    const forcedFallbackTimerRef = useRef<number | null>(null);

    const pageIdToIndex = useMemo(() => {
        const m = new Map<string, number>();
        pages.forEach((p, i) => m.set(p.id, i));
        return m;
    }, [pages]);

    const anchorIndex = Math.max(
        0,
        Math.min(pages.length - 1, forcedAnchorIndex ?? viewportAnchorIndex)
    );

    const viewingPageId = pages[anchorIndex]?.id ?? null;

    // -------- 1) Viewport scroll -> viewportAnchorIndex (stateful + hysteresis) --------
    useEffect(() => {
        if (mode !== "scroll") return;
        if (!rootEl) return;
        if (pageMetrics.offsets.length === 0) return;

        let raf = 0;

        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const y = (rootEl.scrollTop + rootEl.clientHeight * REF_RATIO) / zoom;

                setViewportAnchorIndex((prev) => {
                    const n = pageMetrics.offsets.length;
                    if (n === 0) return 0;

                    let i = Math.max(0, Math.min(n - 1, prev));

                    if (y < pageMetrics.offsets[0]) return 0;
                    const lastTop = pageMetrics.offsets[n - 1];
                    const lastBottom = lastTop + pageMetrics.heights[n - 1];
                    if (y > lastBottom) return n - 1;

                    while (true) {
                        const top = pageMetrics.offsets[i];
                        const bottom = top + pageMetrics.heights[i];
                        const enterPx = Math.max(ENTER_MIN_PX, pageMetrics.heights[i] * ENTER_RATIO);

                        if (y > bottom + enterPx && i < n - 1) {
                            i++;
                            continue;
                        }
                        if (y < top - enterPx && i > 0) {
                            i--;
                            continue;
                        }
                        break;
                    }

                    return i;
                });
            });
        };

        rootEl.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        return () => {
            cancelAnimationFrame(raf);
            rootEl.removeEventListener("scroll", onScroll);
        };
    }, [mode, rootEl, zoom, pageMetrics]);

    // -------- 2) When viewportAnchorIndex reaches forced target -> release forced --------
    useEffect(() => {
        const t = forcedTargetRef.current;
        if (t === null) return;
        if (viewportAnchorIndex === t) {
            forcedTargetRef.current = null;
            setForcedAnchorIndex(null);

            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }

        }
    }, [viewportAnchorIndex]);

    // -------- 3) Preload around viewing --------
    useEffect(() => {
        if (mode !== "scroll") return;
        if (!ensureAround) return;
        const id = viewingPageId;
        if (!id) return;
        ensureAround(id, preloadRadius);
    }, [mode, viewingPageId, ensureAround, preloadRadius]);

    // -------- 4) Notify viewing page id --------
    useEffect(() => {
        if (mode !== "scroll") return;
        onViewingPageIdChange?.(viewingPageId);
    }, [mode, viewingPageId, onViewingPageIdChange]);

    // -------- 5) (Optional) intent scroll: only when active changed by user intent --------
    useEffect(() => {
        if (mode !== "scroll") return;
        if (!activePageId) return;
        if (!rootEl) return;
        if (forcedAnchorIndex !== null) return;

        const dt = Date.now() - (lastManualSelectAtRef.current ?? 0);
        if (dt > 400) return;

        scrollToPage(activePageId, "auto");
    }, [mode, activePageId, rootEl, forcedAnchorIndex, scrollToPage, lastManualSelectAtRef]);

    // -------- Cleanup timers --------
    useEffect(() => {
        return () => {
            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const t = forcedTargetRef.current;
        if (t == null) return;

        if (t >= pages.length) {
            forcedTargetRef.current = null;
            setForcedAnchorIndex(null);


            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }
        }
    }, [pages.length]);


    // -------- Public API: navigateToPage --------
    const navigateToPage = useCallback(
        (pageId: string, opts?: { source?: NavigateSource; behavior?: Behavior; smoothDistancePages?: number }) => {
            if (mode !== "scroll") {
                setActivePageId?.(pageId);
                return;
            }

            const source = opts?.source ?? "pagesPanel";
            const behavior = opts?.behavior ?? "auto";
            const smoothDist = opts?.smoothDistancePages ?? 5;

            const targetIdx = pageIdToIndex.get(pageId);
            if (targetIdx == null) return;

            if (source !== "system") markManualSelect();
            setActivePageId?.(pageId);

            forcedTargetRef.current = targetIdx;
            setForcedAnchorIndex(targetIdx);

            // ✅ เลือก behavior ก่อน
            let scrollBehavior: "auto" | "smooth" = "auto";
            if (behavior === "jump") scrollBehavior = "auto";
            if (behavior === "smooth") scrollBehavior = "smooth";
            if (behavior === "auto") {
                const curIdx = pageIdToIndex.get(activePageId ?? "") ?? anchorIndex;
                const dist = Math.abs(targetIdx - curIdx);
                scrollBehavior = dist > smoothDist ? "auto" : "smooth";
            }

            // ✅ cancel old fallback (แค่เคลียร์ timer)
            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }

            requestAnimationFrame(() => {
                scrollToPage(pageId, scrollBehavior);

                forcedFallbackTimerRef.current = window.setTimeout(() => {
                    forcedTargetRef.current = null;
                    setForcedAnchorIndex(null);

                    forcedFallbackTimerRef.current = null;
                }, 1200);
            });
        },
        [mode, pageIdToIndex, markManualSelect, setActivePageId, scrollToPage, activePageId, anchorIndex]
    );


    return {
        // viewing
        viewportAnchorIndex,
        anchorIndex,
        viewingPageId,

        // forced state (debug)
        forcedAnchorIndex,

        // coordinator refs (optional)
        isProgrammaticScrollRef,

        // main API
        navigateToPage,
    };
}
