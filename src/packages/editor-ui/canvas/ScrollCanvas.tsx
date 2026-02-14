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
import { ptToPx } from "../utils/units";

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
    }, [scrollRootRef?.current]);
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
        useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef, getPageTop, zoom, paddingTop: CANVAS_CONFIG.paddingPx });
    const isZoomingRef = useRef(false);
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
        isZoomingRef,
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

    // -------- Live zoom plumbing --------
    const contentElRef = useRef<HTMLDivElement | null>(null);
    const committedZoomRef = useRef(zoom);
    const liveZoomRef = useRef(zoom);
    const zoomCommitTimerRef = useRef<number | null>(null);

    const applyLiveZoom = React.useCallback((effectiveZoom: number) => {
        const base = committedZoomRef.current || 1;
        const extra = effectiveZoom / base;
        const el = contentElRef.current;
        if (!el) return;
        // ใช้ transform แทน css zoom: ลื่นกว่าและไม่ไปชนกับ layout/scroll บางเคส
        // IMPORTANT: ตั้ง origin เป็น top-center เพื่อให้ zoom เข้า/ออกแล้วยังคง "อยู่กลาง" ของหน้า
        // (origin ซ้ายบนจะทำให้ zoom เข้าแล้วดึงไปซ้าย / zoom ออกแล้วดึงไปขวา)
        el.style.transformOrigin = "50% 0";
        el.style.transform = `scale(${extra})`;
    }, []);

    // IMPORTANT: when committing zoom (setZoom), we must avoid a 1-frame mismatch where
    // live transform scale is cleared before React finishes rendering the new `zoom`.
    // useLayoutEffect runs before paint, so we can atomically:
    // - update committedZoomRef
    // - clear live transform *only after* the committed zoom matches the live zoom
    useLayoutEffect(() => {
        committedZoomRef.current = zoom;

        const el = contentElRef.current;
        const EPS = 1e-6;

        if (isZoomingRef.current) {
            // We're in a live-zoom session; clear the extra transform only once the
            // committed zoom catches up.
            if (Math.abs(liveZoomRef.current - zoom) < EPS) {
                if (el) {
                    el.style.transform = "";
                    el.style.transformOrigin = "";
                }
                isZoomingRef.current = false;
            }
            return;
        }

        // Not zooming: keep refs in sync and ensure no leftover transform.
        liveZoomRef.current = zoom;
        if (el) {
            el.style.transform = "";
            el.style.transformOrigin = "";
        }
    }, [zoom]);

    const scheduleCommitZoom = React.useCallback(() => {
        if (zoomCommitTimerRef.current != null) window.clearTimeout(zoomCommitTimerRef.current);
        zoomCommitTimerRef.current = window.setTimeout(() => {
            zoomCommitTimerRef.current = null;
            setZoom(liveZoomRef.current);
            if (rootEl) requestAnimationFrame(() => rootEl.dispatchEvent(new Event("scroll")));
        }, 160);
    }, [rootEl, setZoom]);

    const zoomWheelDeltaAccRef = useRef(0);
    const zoomWheelClientYRef = useRef<number | null>(null);
    const zoomWheelRafRef = useRef<number | null>(null);

    useEffect(() => {
        const el = rootEl;
        if (!el) return;

        let raf: number | null = null;
        let v = 0;

        const WHEEL_GAIN = 0.4;  // ลด = ช้าลง
        const MAX_V = 40;         // ลด = ช้าลง/ไม่พุ่ง
        const FRICTION = 0.90;    // เพิ่มใกล้ 1 = ไหลยาวขึ้น, ลด = หยุดไวขึ้น

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

                        const prev = liveZoomRef.current;
                        if (!Number.isFinite(prev) || prev <= 0) {
                            zoomWheelDeltaAccRef.current = 0;
                            return;
                        }

                        const accDeltaY = zoomWheelDeltaAccRef.current;
                        zoomWheelDeltaAccRef.current = 0;

                        const next = clamp(
                            prev * zoomStepFromWheel(accDeltaY),
                            CANVAS_CONFIG.zoom.min,
                            CANVAS_CONFIG.zoom.max
                        );
                        if (next === prev) return;

                        const rect = el.getBoundingClientRect();
                        const clientY = zoomWheelClientYRef.current ?? (rect.top + rect.height / 2);
                        const anchorY = clamp(clientY - rect.top, 0, rect.height);

                        // Keep the document point under the cursor stable.
                        const PAD = CANVAS_CONFIG.paddingPx; // (ถ้ามี outer padding อีก ก็ต้องรวมด้วย)
                        const docY = (el.scrollTop + anchorY - PAD) / prev;
                        el.scrollTop = docY * next - anchorY + PAD;

                        // Apply live zoom without forcing React to re-render.
                        isZoomingRef.current = true;
                        liveZoomRef.current = next;
                        applyLiveZoom(next);
                        scheduleCommitZoom();
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
    }, [rootEl, applyLiveZoom, scheduleCommitZoom]);


    useEffect(() => {
        return () => {
            if (zoomCommitTimerRef.current != null) {
                window.clearTimeout(zoomCommitTimerRef.current);
                zoomCommitTimerRef.current = null;
            }
        };
    }, []);

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
        isZoomingRef,
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
            <div ref={contentElRef} style={{ willChange: "transform" }}>
                <div style={{ height: topSpacerPx }} />
                {windowPages.map((p, i) => {
                    const idx = startIdx + i;
                    const dist = Math.abs(idx - anchorIndex);
                    const level = getRenderLevel(dist, CANVAS_CONFIG.renderLevel.fullRadius, CANVAS_CONFIG.renderLevel.skeletonRadius);

                    const preset = document.pagePresetsById?.[p.presetId];
                    const pageWPt = preset?.size?.width ?? 820;
                    const pageHPt = preset?.size?.height ?? 1100;
                    const pageWPx = ptToPx(pageWPt);
                    const pageHPx = ptToPx(pageHPt);

                    return (
                        <React.Fragment key={p.id}>
                            <PageSlot
                                id={p.id}
                                widthPx={pageWPx}
                                heightPx={pageHPx}
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
                                        width={pageWPx}
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
                            const pageWPt = preset?.size?.width ?? 820;
                            const pageWPx = ptToPx(pageWPt);

                            return (
                                <GapSlot
                                    width={pageWPx}
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
        </div>
    );
}
