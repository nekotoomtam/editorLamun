"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

export type VirtualWindowArgs = {
    rootEl: HTMLElement | null;
    offsets: number[]; // doc units
    heights: number[]; // doc units
    zoom: number;
    paddingPx: number;

    /**
     * When true, suppress scroll-driven state updates.
     * Useful during live ctrl/meta+wheel zoom where we mutate scrollTop and apply
     * a transient CSS zoom factor imperatively.
     */
    isZoomingRef?: MutableRefObject<boolean>;

    anchorIndex: number;
    activeIndex: number;

    /** Base overscan (pages). */
    overscanBasePages?: number;
    /** Additional overscan derived from scroll velocity (pages). */
    overscanMaxExtraPages?: number;
    /** Keep these many pages around anchor/active mounted even if out of viewport window. */
    keepAroundPages?: number;
};

export type VirtualWindowResult = {
    startIdx: number;
    endIdx: number;
    topSpacerPx: number;
    bottomSpacerPx: number;
    totalDocHeightDoc: number;
    overscanPages: number;
};

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function findIndexAtY(offsets: number[], heights: number[], y: number) {
    const n = offsets.length;
    if (n === 0) return 0;

    // binary search: greatest i with offsets[i] <= y
    let lo = 0,
        hi = n - 1,
        ans = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid] <= y) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    // clamp to page bottom
    const top = offsets[ans];
    const bottom = top + heights[ans];
    if (y > bottom && ans < n - 1) return Math.min(n - 1, ans + 1);
    return ans;
}

/**
 * Virtual windowing for long scroll documents.
 * - Tracks scrollTop/clientHeight in state so re-renders happen on scroll.
 * - Adds dynamic overscan based on scroll velocity.
 */
export function useVirtualWindow({
    rootEl,
    offsets,
    heights,
    zoom,
    paddingPx,
    isZoomingRef,
    anchorIndex,
    activeIndex,
    overscanBasePages = 6,
    overscanMaxExtraPages = 10,
    keepAroundPages = 10,
}: VirtualWindowArgs): VirtualWindowResult {
    const [scrollTop, setScrollTop] = useState(0);
    const [clientH, setClientH] = useState(0);

    // velocity estimate (px/ms)
    const lastScrollRef = useRef<{ t: number; y: number; v: number }>({
        t: 0,
        y: 0,
        v: 0,
    });

    useEffect(() => {
        if (!rootEl) return;

        let raf = 0;

        const update = () => {
            raf = 0;
            const y = rootEl.scrollTop;
            const h = rootEl.clientHeight;
            setScrollTop(y);
            setClientH(h);

            const now = performance.now();
            const prev = lastScrollRef.current;
            const dt = Math.max(1, now - prev.t);
            const dy = Math.abs(y - prev.y);
            // exponential moving average
            const v = dy / dt;
            lastScrollRef.current = {
                t: now,
                y,
                v: prev.v * 0.7 + v * 0.3,
            };
        };

        const onScroll = () => {
            if (isZoomingRef?.current) return;
            if (raf) return;
            raf = requestAnimationFrame(update);
        };

        rootEl.addEventListener("scroll", onScroll, { passive: true });
        // initial
        update();

        // simple resize tracking (fail-soft if ResizeObserver unavailable)
        let ro: ResizeObserver | null = null;
        try {
            if (typeof ResizeObserver !== "undefined") {
                ro = new ResizeObserver(() => {
                    if (isZoomingRef?.current) return;
                    update();
                });
                ro.observe(rootEl);
            }
        } catch {
            ro = null;
        }

        return () => {
            if (raf) cancelAnimationFrame(raf);
            rootEl.removeEventListener("scroll", onScroll);
            try {
                ro?.disconnect();
            } catch { }
        };
    }, [rootEl]);

    const totalDocHeightDoc = useMemo(() => {
        if (offsets.length === 0) return 0;
        const last = offsets.length - 1;
        return offsets[last] + (heights[last] ?? 0);
    }, [offsets, heights]);

    const overscanPages = useMemo(() => {
        // heuristic: faster scroll => more overscan
        const v = lastScrollRef.current.v; // px/ms
        // roughly map 0..1.2 px/ms -> 0..overscanMaxExtraPages
        const extra = Math.round(clamp(v / 0.12, 0, overscanMaxExtraPages));
        return overscanBasePages + extra;
    }, [scrollTop, overscanBasePages, overscanMaxExtraPages]);

    return useMemo(() => {
        const n = offsets.length;
        if (n === 0) {
            return {
                startIdx: 0,
                endIdx: 0,
                topSpacerPx: 0,
                bottomSpacerPx: 0,
                totalDocHeightDoc,
                overscanPages,
            };
        }

        const yTopDoc = Math.max(0, (scrollTop - paddingPx) / zoom);
        const yBottomDoc = Math.max(0, (scrollTop + clientH - paddingPx) / zoom);

        const startVis = findIndexAtY(offsets, heights, yTopDoc);
        const endVis = findIndexAtY(offsets, heights, yBottomDoc) + 1;

        let startIdx = Math.max(0, startVis - overscanPages);
        let endIdx = Math.min(n, endVis + overscanPages);

        // Keep anchor + active inside window so interactions feel stable.
        const keep = keepAroundPages;
        startIdx = Math.min(
            startIdx,
            clamp(anchorIndex - keep, 0, n),
            activeIndex >= 0 ? clamp(activeIndex - keep, 0, n) : startIdx
        );
        endIdx = Math.max(
            endIdx,
            clamp(anchorIndex + keep + 1, 0, n),
            activeIndex >= 0 ? clamp(activeIndex + keep + 1, 0, n) : endIdx
        );

        startIdx = clamp(startIdx, 0, n);
        endIdx = clamp(endIdx, startIdx, n);

        const topSpacerPx = (offsets[startIdx] ?? 0) * zoom;
        const endTopDoc = endIdx < n ? offsets[endIdx] ?? totalDocHeightDoc : totalDocHeightDoc;
        const bottomSpacerPx = Math.max(0, (totalDocHeightDoc - endTopDoc) * zoom);

        return {
            startIdx,
            endIdx,
            topSpacerPx,
            bottomSpacerPx,
            totalDocHeightDoc,
            overscanPages,
        };
    }, [
        offsets,
        heights,
        zoom,
        paddingPx,
        scrollTop,
        clientH,
        anchorIndex,
        activeIndex,
        totalDocHeightDoc,
        overscanPages,
        keepAroundPages,
    ]);
}
