import React, { useEffect, useImperativeHandle, useRef } from "react";

import type { DocumentJson, Id, PageJson } from "../../editor-core/schema";

import { VirtualPage } from "../components/VirtualPage";

import { useScrollToPage } from "../hooks/useScrollToPage";
import { usePageNavigator } from "../hooks/usePageNavigator";
import { usePageNodesMock } from "../hooks/usePageNodesMock";

import { PageSlot } from "./components/PageSlot";
import { GapSlot } from "./components/GapSlot";
import { getRenderLevel } from "./utils";
import type { CanvasNavigatorHandle } from "../CanvasView";

export function ScrollCanvas(props: {
    document: DocumentJson;
    pages: PageJson[];
    pageMetrics: { offsets: number[]; heights: number[]; gapPx: number };
    zoom: number;
    showMargin: boolean;
    activePageId: Id | null;
    setActivePageId: (id: Id | null) => void;
    onAddPageAfter?: (pageId: Id) => Id | null;
    scrollRootRef?: React.RefObject<HTMLElement | null>;
    onViewingPageIdChange?: (pageId: Id | null) => void;
    refHandle: React.Ref<CanvasNavigatorHandle> | null;
}) {
    const {
        document,
        pages,
        pageMetrics,
        zoom,
        showMargin,
        activePageId,
        setActivePageId,
        onAddPageAfter,
        scrollRootRef,
        onViewingPageIdChange,
        refHandle,
    } = props;

    const rootEl = scrollRootRef?.current ?? null;
    const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const pendingNavRef = useRef<Id | null>(null);
    const isProgrammaticScrollRef = useRef(false);


    const indexById = React.useMemo(() => {
        const m: Record<string, number> = {};
        pages.forEach((p, i) => (m[p.id] = i));
        return m;
    }, [pages]);

    const getPageTop = React.useCallback(
        (pageId: string) => {
            const idx = indexById[pageId];
            if (idx == null) return null;
            return pageMetrics.offsets[idx] ?? null;
        },
        [indexById, pageMetrics.offsets]
    );

    const { scrollToPage, markManualSelect, registerPageRef, lastManualSelectAtRef } =
        useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef, getPageTop, zoom, paddingTop: 24 });

    const nodesMock = usePageNodesMock(document);

    const nav = usePageNavigator({
        mode: "scroll",
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

        ensureAround: (pageId, r) => nodesMock.ensureAround(pageId, r),
        preloadRadius: 2,
        isProgrammaticScrollRef,
    });

    useImperativeHandle(refHandle, () => ({ navigateToPage: nav.navigateToPage }), [nav.navigateToPage]);

    useEffect(() => {
        const id = pendingNavRef.current;
        if (!id) return;
        if (!pages.some(p => p.id === id)) return;

        pendingNavRef.current = null;
        requestAnimationFrame(() => {
            nav.navigateToPage(id, { source: "canvas", behavior: "auto", smoothDistancePages: 5 });
        });
    }, [pages, nav.navigateToPage]);

    const anchorIndex = nav.anchorIndex;
    const activeIndex = activePageId ? (indexById[activePageId] ?? -1) : -1;
    const GAP_RADIUS = 1;
    // -------- Virtualization window (300–500 pages) --------
    // Render only a slice of pages + spacers to keep DOM light.
    const PADDING_PX = 24;
    const OVERSCAN_PAGES = 6; // tune: 4–10

    const findIndexAtY = React.useCallback(
        (y: number) => {
            const n = pageMetrics.offsets.length;
            if (n === 0) return 0;
            // binary search: greatest i with offsets[i] <= y
            let lo = 0, hi = n - 1, ans = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (pageMetrics.offsets[mid] <= y) {
                    ans = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            // clamp to page bottom
            const top = pageMetrics.offsets[ans];
            const bottom = top + pageMetrics.heights[ans];
            if (y > bottom && ans < n - 1) return Math.min(n - 1, ans + 1);
            return ans;
        },
        [pageMetrics.offsets, pageMetrics.heights]
    );

    const totalDocHeight =
        pageMetrics.offsets.length === 0
            ? 0
            : pageMetrics.offsets[pageMetrics.offsets.length - 1] +
            pageMetrics.heights[pageMetrics.heights.length - 1];

    const rootScrollTop = rootEl?.scrollTop ?? 0;
    const rootClientH = rootEl?.clientHeight ?? 0;

    const yTop = Math.max(0, (rootScrollTop - PADDING_PX) / zoom);
    const yBottom = Math.max(0, (rootScrollTop + rootClientH - PADDING_PX) / zoom);

    const startVis = findIndexAtY(yTop);
    const endVis = findIndexAtY(yBottom) + 1;

    let startIdx = Math.max(0, startVis - OVERSCAN_PAGES);
    let endIdx = Math.min(pages.length, endVis + OVERSCAN_PAGES);

    // keep anchor + active inside window so interactions feel stable
    startIdx = Math.min(startIdx, Math.max(0, anchorIndex - 10), activeIndex >= 0 ? Math.max(0, activeIndex - 10) : startIdx);
    endIdx = Math.max(endIdx, Math.min(pages.length, anchorIndex + 11), activeIndex >= 0 ? Math.min(pages.length, activeIndex + 11) : endIdx);

    const topSpacerPx = (pageMetrics.offsets[startIdx] ?? 0) * zoom;
    const endTop = endIdx < pages.length ? (pageMetrics.offsets[endIdx] ?? totalDocHeight) : totalDocHeight;
    const bottomSpacerPx = Math.max(0, (totalDocHeight - endTop) * zoom);

    const windowPages = pages.slice(startIdx, endIdx);


    const shouldRenderGap = (idx: number) =>
        Math.abs(idx - anchorIndex) <= GAP_RADIUS ||
        (activeIndex >= 0 && Math.abs(idx - activeIndex) <= GAP_RADIUS);

    return (
        <div style={{ padding: 24 }}>
            <div style={{ height: topSpacerPx }} />
            {windowPages.map((p, i) => {
                const idx = startIdx + i;
                const dist = Math.abs(idx - anchorIndex);
                const level = getRenderLevel(dist, 2, 8);

                const preset = document.pagePresetsById?.[p.presetId];
                const pageW = preset?.size?.width ?? 820;
                const pageH = preset?.size?.height ?? 1100;

                return (
                    <React.Fragment key={p.id}>
                        <PageSlot
                            id={p.id}
                            width={pageW}
                            height={pageH}
                            zoom={zoom}
                            registerRef={registerPageRef}
                        >
                            <VirtualPage
                                document={document}
                                page={p}
                                showMargin={showMargin}
                                active={p.id === activePageId}
                                level={level}
                                onActivate={() => {
                                    if (p.id === activePageId) return;
                                    nav.navigateToPage(p.id, {
                                        source: "canvas",
                                        behavior: "auto",
                                        smoothDistancePages: 5,
                                    });
                                }}
                                loading={nodesMock.isLoading(p.id) && p.id === pages[anchorIndex]?.id}
                            />
                        </PageSlot>

                        {idx < pages.length - 1 && idx + 1 < endIdx && (
                            shouldRenderGap(idx) ? (
                                <GapSlot
                                    width={pageW}
                                    gapPx={pageMetrics.gapPx}
                                    zoom={zoom}
                                    scrollRoot={rootEl}
                                    onAdd={() => {
                                        markManualSelect();
                                        const newId = onAddPageAfter?.(p.id);
                                        if (!newId) return;
                                        pendingNavRef.current = newId;
                                    }}
                                />
                            ) : (
                                <div style={{ height: pageMetrics.gapPx * zoom }} />
                            )
                        )}
                    </React.Fragment>
                );
            })}

            {pages.length > 0 && (
                shouldRenderGap(pages.length - 1) ? (
                    (() => {
                        const last = pages[pages.length - 1];
                        const preset = document.pagePresetsById?.[last.presetId];
                        const pageW = preset?.size?.width ?? 820;

                        return (
                            <GapSlot
                                width={pageW}
                                gapPx={pageMetrics.gapPx}
                                zoom={zoom}
                                scrollRoot={rootEl}
                                onAdd={() => {
                                    markManualSelect();
                                    const lastId = last.id;
                                    const newId = onAddPageAfter?.(lastId);
                                    if (!newId) return;
                                    setActivePageId(newId);
                                    pendingNavRef.current = newId;
                                }}
                            />
                        );
                    })()
                ) : (
                    <div style={{ height: pageMetrics.gapPx * zoom }} />
                )
            )}
            <div style={{ height: bottomSpacerPx }} />
        </div>
    );
}
