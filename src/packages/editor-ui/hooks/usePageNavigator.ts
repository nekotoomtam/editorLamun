import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageJson } from "../../editor-core/schema";
import { CANVAS_CONFIG } from "../canvas/canvasConfig";

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
    // Separate "viewing" index for UX stability (dead-zone / hysteresis)
    const [viewingIndex, setViewingIndex] = useState(0);

    // Anchor hysteresis tuning (perf/render window)
    const REF_RATIO = 0.6;
    const ENTER_RATIO = 0.12;
    const ENTER_MIN_PX = 140;

    // Viewing dead-zone (UX)
    const VIEW_ANCHOR_TOP = 0.35;
    const VIEW_ANCHOR_BOTTOM = 0.65;
    const PADDING_PX = CANVAS_CONFIG.paddingPx; // keep in sync with Canvas padding

    // -------- Navigation control (the "coordinator") --------

    const [forcedAnchorIndex, setForcedAnchorIndex] = useState<number | null>(null);
    const forcedTargetRef = useRef<number | null>(null);
    const forcedFallbackTimerRef = useRef<number | null>(null);
    const programmaticCooldownTimerRef = useRef<number | null>(null);

    const pageIdToIndex = useMemo(() => {
        const m = new Map<string, number>();
        pages.forEach((p, i) => m.set(p.id, i));
        return m;
    }, [pages]);

    const anchorIndex = Math.max(
        0,
        Math.min(pages.length - 1, forcedAnchorIndex ?? viewportAnchorIndex)
    );

    // "Viewing" is intentionally NOT tied to anchorIndex.
    // anchorIndex may change for perf/virtualization; viewingIndex is stabilized for UI.
    const viewingPageId = pages[Math.max(0, Math.min(pages.length - 1, viewingIndex))]?.id ?? null;
    const lastReportedViewingRef = useRef<string | null>(null);

    const reportViewing = useCallback(
        (id: string | null) => {
            if (lastReportedViewingRef.current === id) return;
            lastReportedViewingRef.current = id;
            onViewingPageIdChange?.(id);
        },
        [onViewingPageIdChange]
    );

    // -------- 1) Viewport scroll -> viewportAnchorIndex (stateful + hysteresis) --------
    useEffect(() => {
        if (mode !== "scroll") return;
        if (!rootEl) return;
        if (pageMetrics.offsets.length === 0) return;

        let raf = 0;

        const findIndexAtY = (y: number) => {
            const n = pageMetrics.offsets.length;
            if (n === 0) return 0;
            let lo = 0;
            let hi = n - 1;
            let ans = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (pageMetrics.offsets[mid] <= y) {
                    ans = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            const top = pageMetrics.offsets[ans];
            const bottom = top + pageMetrics.heights[ans];
            if (y > bottom && ans < n - 1) return Math.min(n - 1, ans + 1);
            return ans;
        };

        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const scrollTop = Math.max(0, rootEl.scrollTop - PADDING_PX);
                const clientH = rootEl.clientHeight;

                // 1) Anchor index (perf / render window)
                const y = (scrollTop + clientH * REF_RATIO) / zoom;

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

                // 2) Viewing index (UX dead-zone)
                setViewingIndex((prev) => {
                    const n = pageMetrics.offsets.length;
                    if (n === 0) return 0;

                    const y1 = (scrollTop + clientH * VIEW_ANCHOR_TOP) / zoom;
                    const y2 = (scrollTop + clientH * VIEW_ANCHOR_BOTTOM) / zoom;

                    let i = Math.max(0, Math.min(n - 1, prev));
                    const top = pageMetrics.offsets[i];
                    const bottom = top + pageMetrics.heights[i];

                    // If current page still covers the dead-zone interval, keep it.
                    if (y1 >= top && y2 <= bottom) return i;

                    // Otherwise choose index at the center of the interval.
                    const mid = (y1 + y2) / 2;
                    return findIndexAtY(mid);
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
    const releaseProgrammatic = useCallback((cooldownMs = 120) => {
        if (programmaticCooldownTimerRef.current) {
            window.clearTimeout(programmaticCooldownTimerRef.current);
            programmaticCooldownTimerRef.current = null;
        }
        programmaticCooldownTimerRef.current = window.setTimeout(() => {
            isProgrammaticScrollRef.current = false;
            programmaticCooldownTimerRef.current = null;
        }, cooldownMs);
    }, [isProgrammaticScrollRef]);

    useEffect(() => {
        const t = forcedTargetRef.current;
        if (t === null) return;

        if (viewportAnchorIndex === t) {
            forcedTargetRef.current = null;
            setForcedAnchorIndex(null);

            // ✅ clear programmatic lock (with small cooldown to avoid immediate bounce)
            releaseProgrammatic(120);

            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }
            reportViewing(pages[t]?.id ?? null);
        }
    }, [viewportAnchorIndex, pages, reportViewing, releaseProgrammatic]);


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

        // ✅ ระหว่าง programmatic scroll: ไม่ต้องรายงานระหว่างทาง (กัน left panel follow เด้ง)
        if (isProgrammaticScrollRef.current) return;

        reportViewing(viewingPageId);
    }, [mode, viewingPageId, reportViewing, isProgrammaticScrollRef]);


    // -------- 5) (Optional) intent scroll: only when active changed by user intent --------


    // -------- Cleanup timers --------
    useEffect(() => {
        return () => {
            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }
            if (programmaticCooldownTimerRef.current) {
                window.clearTimeout(programmaticCooldownTimerRef.current);
                programmaticCooldownTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const t = forcedTargetRef.current;
        if (t == null) return;

        if (t >= pages.length) {
            forcedTargetRef.current = null;
            setForcedAnchorIndex(null);

            // ✅ clear programmatic lock ด้วย กันค้าง
            releaseProgrammatic(120);

            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }
        }
    }, [pages.length, releaseProgrammatic]);

    // -------- 2.5) Release programmatic lock early when we actually arrive --------
    useEffect(() => {
        if (mode !== "scroll") return;

        const t = forcedTargetRef.current;
        if (t == null) return;

        if (viewportAnchorIndex !== t) return;

        // Arrived at target: release immediately (no waiting for timeout)
        forcedTargetRef.current = null;
        setForcedAnchorIndex(null);
        releaseProgrammatic(120);

        if (forcedFallbackTimerRef.current) {
            window.clearTimeout(forcedFallbackTimerRef.current);
            forcedFallbackTimerRef.current = null;
        }

        reportViewing(pages[t]?.id ?? null);
    }, [mode, viewportAnchorIndex, pages, reportViewing, releaseProgrammatic]);



    useEffect(() => {
        if (mode !== "scroll" || !rootEl) {
            forcedTargetRef.current = null;
            setForcedAnchorIndex(null);
            isProgrammaticScrollRef.current = false;
            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }

        }
    }, [mode, rootEl, isProgrammaticScrollRef]);


    // -------- Public API: navigateToPage --------
    const anchorIndexRef = useRef(0);
    useEffect(() => { anchorIndexRef.current = anchorIndex; }, [anchorIndex]);

    const navigateToPage = useCallback(
        (pageId: string, opts?: { source?: NavigateSource; behavior?: Behavior; smoothDistancePages?: number }) => {
            if (mode !== "scroll") {
                setActivePageId?.(pageId);
                return;
            }

            if (!rootEl) {  // ✅ อันนี้เช็คตอนเริ่มยังพอคุ้ม
                forcedTargetRef.current = null;
                setForcedAnchorIndex(null);
                isProgrammaticScrollRef.current = false;
                return;
            }

            const source = opts?.source ?? "pagesPanel";
            const behavior = opts?.behavior ?? "auto";
            const smoothDist = opts?.smoothDistancePages ?? 5;

            const targetIdx = pageIdToIndex.get(pageId);
            if (targetIdx == null) return;

            if (source !== "system") markManualSelect();
            setActivePageId?.(pageId);

            const curAnchor = anchorIndexRef.current;
            if (targetIdx === curAnchor) {
                forcedTargetRef.current = null;
                setForcedAnchorIndex(null);
                releaseProgrammatic(120);
                reportViewing(pageId);

                return;
            }

            forcedTargetRef.current = targetIdx;
            setForcedAnchorIndex(targetIdx);

            let scrollBehavior: "auto" | "smooth" = "auto";
            if (behavior === "jump") scrollBehavior = "auto";
            if (behavior === "smooth") scrollBehavior = "smooth";
            if (behavior === "auto") {
                const dist = Math.abs(targetIdx - curAnchor);
                scrollBehavior = dist > smoothDist ? "auto" : "smooth";
            }

            if (forcedFallbackTimerRef.current) {
                window.clearTimeout(forcedFallbackTimerRef.current);
                forcedFallbackTimerRef.current = null;
            }

            // lock during programmatic scroll
            if (programmaticCooldownTimerRef.current) {
                window.clearTimeout(programmaticCooldownTimerRef.current);
                programmaticCooldownTimerRef.current = null;
            }
            isProgrammaticScrollRef.current = true;

            requestAnimationFrame(() => {
                scrollToPage(pageId, scrollBehavior);

                forcedFallbackTimerRef.current = window.setTimeout(() => {
                    forcedTargetRef.current = null;
                    setForcedAnchorIndex(null);
                    releaseProgrammatic(120);
                    forcedFallbackTimerRef.current = null;

                    // ✅ รายงานครั้งเดียวหลังหมดเวลา (กันค้าง/ไม่ปล่อย forced)
                    reportViewing(pageId);
                }, 1200);

            });
        }, [mode, pageIdToIndex, markManualSelect, setActivePageId, scrollToPage, pages, reportViewing, releaseProgrammatic]);



    return {
        // viewing
        viewportAnchorIndex,
        anchorIndex,
        viewingPageId,

        // UX viewing index (debug)
        viewingIndex,

        // forced state (debug)
        forcedAnchorIndex,

        // coordinator refs (optional)
        isProgrammaticScrollRef,

        // main API
        navigateToPage,
    };
}
