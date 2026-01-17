import React, { useEffect, useImperativeHandle, useRef } from "react";

import type { DocumentJson, Id, PageJson } from "../../editor-core/schema";

import { VirtualPage } from "../components/VirtualPage";

import { useScrollToPage } from "../hooks/useScrollToPage";
import { usePageNavigator } from "../hooks/usePageNavigator";
import { usePageNodesMock } from "../hooks/usePageNodesMock";

import { PageSlot } from "./components/PageSlot";
import { GapSlot } from "./components/GapSlot";
import { useVirtualWindow } from "./hooks/useVirtualWindow";
import { getRenderLevel } from "./utils";
import type { CanvasNavigatorHandle } from "../CanvasView";
import { CANVAS_CONFIG } from "./canvasConfig";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}
function zoomStepFromWheel(deltaY: number) {
    // ปรับความไวตรงนี้:
    // 0.0015 = หมุน 100px => ~15% (ค่อนข้างไว)
    // 0.0008 = หมุน 100px => ~8%  (กำลังดี)
    const k = 0.0008;
    return Math.exp(-deltaY * k); // smooth + ไม่พุ่ง
}
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
    setZoom: (z: number) => void;
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
        setZoom
    } = props;


    const prevZoomRef = useRef(zoom);
    const [rootEl, setRootEl] = React.useState<HTMLElement | null>(null);

    useEffect(() => {
        setRootEl(scrollRootRef?.current ?? null);
    }, [scrollRootRef]);
    const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const pendingNavRef = useRef<Id | null>(null);
    const isProgrammaticScrollRef = useRef(false);

    useEffect(() => {
        if (!rootEl) setRootEl(scrollRootRef?.current ?? null);
    }, [rootEl, scrollRootRef]);


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
        useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef, getPageTop, zoom, paddingTop: CANVAS_CONFIG.paddingPx });

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
        if (!pages.some((p) => p.id === id)) return;

        pendingNavRef.current = null;
        requestAnimationFrame(() => {
            nav.navigateToPage(id, { source: "canvas", behavior: "auto", smoothDistancePages: 5 });
        });
    }, [pages, nav.navigateToPage]);

    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    useEffect(() => {
        const el = rootEl;
        if (!el) return;

        const prevZoom = prevZoomRef.current;
        if (prevZoom === zoom) return;

        const padding = CANVAS_CONFIG.paddingPx;
        const anchorDocY = (el.scrollTop + el.clientHeight / 2 - padding) / prevZoom;
        const nextScrollTop = anchorDocY * zoom + padding - el.clientHeight / 2;

        isProgrammaticScrollRef.current = true;
        requestAnimationFrame(() => {
            el.scrollTop = Math.max(0, nextScrollTop);
            requestAnimationFrame(() => {
                isProgrammaticScrollRef.current = false;
            });
        });

        prevZoomRef.current = zoom;
    }, [zoom, rootEl]);

    useEffect(() => {
        const el = rootEl;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            e.stopPropagation();

            const prev = zoomRef.current;
            const next = clamp(prev * zoomStepFromWheel(e.deltaY), 0.25, 3);
            if (next === prev) return;

            setZoom(next);
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel as any);
    }, [rootEl, setZoom]);


    const anchorIndex = nav.anchorIndex;
    const activeIndex = activePageId ? (indexById[activePageId] ?? -1) : -1;
    const GAP_RADIUS = CANVAS_CONFIG.gap.radiusPages;
    const PADDING_PX = CANVAS_CONFIG.paddingPx; // keep in sync with Canvas padding
    // const OVERSCAN_PAGES = CANVAS_CONFIG.virtualization.overscanPages; // (kept in config)

    const { startIdx, endIdx, topSpacerPx, bottomSpacerPx } = useVirtualWindow({
        rootEl,
        offsets: pageMetrics.offsets,
        heights: pageMetrics.heights,
        zoom,
        paddingPx: PADDING_PX,
        anchorIndex,
        activeIndex,

        // tuning knobs
        overscanBasePages: CANVAS_CONFIG.virtualization.overscanPages,
        overscanMaxExtraPages: CANVAS_CONFIG.virtualization.overscanMaxExtraPages,
        keepAroundPages: CANVAS_CONFIG.virtualization.keepAroundPages,
    });

    const windowPages = pages.slice(startIdx, endIdx);


    const shouldRenderGap = (idx: number) =>
        Math.abs(idx - anchorIndex) <= GAP_RADIUS ||
        (activeIndex >= 0 && Math.abs(idx - activeIndex) <= GAP_RADIUS);
    return (
        <div style={{ padding: CANVAS_CONFIG.paddingPx }}>
            <div style={{ height: topSpacerPx }} />
            {windowPages.map((p, i) => {
                const idx = startIdx + i;
                const dist = Math.abs(idx - anchorIndex);
                const level = getRenderLevel(dist, CANVAS_CONFIG.renderLevel.fullRadius, CANVAS_CONFIG.renderLevel.skeletonRadius);

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
                                        smoothDistancePages: CANVAS_CONFIG.navigation.smoothDistancePages,
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
