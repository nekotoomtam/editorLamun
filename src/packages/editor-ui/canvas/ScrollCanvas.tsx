import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

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
    // NOTE: zoom is handled via a single wheel listener below.
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
    // Ctrl/meta + wheel zoom can fire extremely frequently (especially on trackpads).
    // To avoid jank, we batch zoom + scrollTop updates into at most 1 commit per frame.
    const zoomWheelDeltaAccRef = useRef(0);
    const zoomWheelClientYRef = useRef<number | null>(null);
    const zoomWheelRafRef = useRef<number | null>(null);

    // When zoom changes (by wheel or buttons), we adjust scrollTop so the same document point stays under the anchor.
    // - Wheel: anchor = cursor Y
    // - Buttons/reset: anchor = viewport center
    const pendingZoomAnchorRef = useRef<null | { prev: number; baseScrollTop: number; anchorY: number }>(null);
    const prevZoomAppliedRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    useEffect(() => {
        const el = rootEl;
        if (!el) return;

        let raf: number | null = null;
        let v = 0;

        const WHEEL_GAIN = 0.15;  // ลด = ช้าลง
        const MAX_V = 14;         // ลด = ช้าลง/ไม่พุ่ง
        const FRICTION = 0.88;    // เพิ่มใกล้ 1 = ไหลยาวขึ้น, ลด = หยุดไวขึ้น

        const isLikelyMouseWheel = (e: WheelEvent) => {
            const dy = Math.abs(e.deltaY);
            if (e.deltaMode !== 0) return true; // line/page mode = mouse wheel บ่อย
            if (dy >= 50) return true;          // ก้อนใหญ่ = mouse wheel บ่อย
            return false;                       // นอกนั้นให้ถือว่า trackpad
        };

        const stopInertia = () => {
            v = 0;
            if (raf != null) {
                cancelAnimationFrame(raf);
                raf = null;
            }
        };

        const tick = () => {
            raf = null;
            if (Math.abs(v) < 0.1) { v = 0; return; }
            el.scrollTop += v;
            v *= FRICTION;
            raf = requestAnimationFrame(tick);
        };

        const onWheel = (e: WheelEvent) => {
            // 1) Zoom (ctrl/meta)
            if (e.ctrlKey || e.metaKey) {
                stopInertia();
                e.preventDefault();
                e.stopPropagation();

                // Accumulate wheel delta and last cursor position, then apply once per frame.
                zoomWheelDeltaAccRef.current += e.deltaY;
                zoomWheelClientYRef.current = e.clientY;

                if (zoomWheelRafRef.current == null) {
                    zoomWheelRafRef.current = requestAnimationFrame(() => {
                        zoomWheelRafRef.current = null;

                        const prev = zoomRef.current;
                        if (!Number.isFinite(prev) || prev <= 0) {
                            zoomWheelDeltaAccRef.current = 0;
                            return;
                        }

                        const accDeltaY = zoomWheelDeltaAccRef.current;
                        zoomWheelDeltaAccRef.current = 0;

                        const next = clamp(prev * zoomStepFromWheel(accDeltaY), 0.3, 3);
                        if (next === prev) return;

                        const rect = el.getBoundingClientRect();
                        const clientY = zoomWheelClientYRef.current ?? (rect.top + rect.height / 2);
                        const anchorY = clamp(clientY - rect.top, 0, rect.height);

                        // Keep the document point under the cursor stable (account for canvas padding).
                        pendingZoomAnchorRef.current = {
                            prev,
                            baseScrollTop: el.scrollTop,
                            anchorY,
                        };

                        setZoom(next);
                    });
                }
                return;
            }


            // 2) Scroll inertia เฉพาะ mouse wheel
            if (!isLikelyMouseWheel(e)) {
                // trackpad: ปล่อย native
                stopInertia();
                return;
            }

            e.preventDefault();

            const dyPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // line->px
            v += dyPx * WHEEL_GAIN;
            if (v > MAX_V) v = MAX_V;
            if (v < -MAX_V) v = -MAX_V;

            if (raf == null) raf = requestAnimationFrame(tick);
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", onWheel as any);
            stopInertia();

            if (zoomWheelRafRef.current != null) {
                cancelAnimationFrame(zoomWheelRafRef.current);
                zoomWheelRafRef.current = null;
            }
            zoomWheelDeltaAccRef.current = 0;
            zoomWheelClientYRef.current = null;
        };
    }, [rootEl, setZoom]);


    // Apply anchored scrollTop adjustment whenever zoom changes (wheel, +/- buttons, reset, etc.).
    useLayoutEffect(() => {
        const el = rootEl;
        if (!el) {
            prevZoomAppliedRef.current = zoom;
            pendingZoomAnchorRef.current = null;
            return;
        }

        const prev = prevZoomAppliedRef.current;
        const next = zoom;
        if (!Number.isFinite(prev) || prev <= 0 || prev === next) {
            prevZoomAppliedRef.current = next;
            pendingZoomAnchorRef.current = null;
            return;
        }

        const pad = CANVAS_CONFIG.paddingPx;
        const pending = pendingZoomAnchorRef.current;
        const anchorY = pending?.anchorY ?? (el.clientHeight / 2);
        const baseScrollTop = pending?.baseScrollTop ?? el.scrollTop;

        // Convert viewport anchor to document-space Y (origin = top of first page, i.e. after padding).
        const docY = (baseScrollTop + anchorY - pad) / prev;
        let newScrollTop = docY * next - anchorY + pad;

        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        if (!Number.isFinite(newScrollTop)) {
            // noop
        } else {
            if (newScrollTop < 0) newScrollTop = 0;
            if (newScrollTop > maxScroll) newScrollTop = maxScroll;
            el.scrollTop = newScrollTop;
        }

        pendingZoomAnchorRef.current = null;
        prevZoomAppliedRef.current = next;
    }, [zoom, rootEl]);


    // IMPORTANT: Do not add another ctrl/meta wheel listener here.
    // Having multiple wheel listeners that all call setZoom will cause zoom to "fight"
    // (double updates, inconsistent preventDefault/stopPropagation behavior).


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
