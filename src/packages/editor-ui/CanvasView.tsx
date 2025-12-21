"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { DocumentJson, PageJson } from "../editor-core/schema";

import { GapAdd } from "./components/GapAdd";
import { VirtualPage } from "./components/VirtualPage";
import { PageView } from "./components/PageView";

import { useScrollToPage } from "./hooks/useScrollToPage";

import { usePageNodesMock } from "./hooks/usePageNodesMock";

type CanvasMode = "single" | "scroll";
type PageRenderLevel = "full" | "skeleton" | "none";
function getLevel(dist: number, fullR = 2, skelR = 8): PageRenderLevel {
    if (dist <= fullR) return "full";
    if (dist <= skelR) return "skeleton";
    return "none";
}
function findAnchorIndex(targetPx: number, offsets: number[]) {
    let lo = 0, hi = offsets.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const a = offsets[mid];
        const b = mid + 1 < offsets.length ? offsets[mid + 1] : Number.POSITIVE_INFINITY;

        if (targetPx < a) hi = mid - 1;
        else if (targetPx >= b) lo = mid + 1;
        else return mid;
    }
    return Math.max(0, Math.min(offsets.length - 1, lo));
}



export function CanvasView({
    document,
    activePageId,
    showMargin = false,
    mode = "single",
    onAddPageAfter,
    zoom = 1,
    setActivePageId,
    scrollRootRef,
}: {
    document: DocumentJson;
    activePageId: string | null;
    showMargin?: boolean;
    mode?: CanvasMode;
    onAddPageAfter?: (pageId: string) => void;
    zoom?: number;
    setActivePageId?: (pageId: string) => void;
    scrollRootRef?: React.RefObject<HTMLElement | null>;
}) {
    /* ---------- shared refs ---------- */
    const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const rootEl = scrollRootRef?.current ?? null;

    /* ---------- helpers: pages ordered ---------- */
    const pages: PageJson[] = useMemo(() => {
        const order = document.pageOrder ?? [];
        const byId = document.pagesById ?? ({} as any);
        return order.map(id => byId[id]).filter(Boolean);
    }, [document.pageOrder, document.pagesById]);

    /* ---------- page width helper ---------- */
    const pageWidthById = useMemo(() => {
        const presetById = document.pagePresetsById ?? ({} as any);
        const out = new Map<string, number>();
        for (const pg of pages) {
            out.set(pg.id, presetById[pg.presetId]?.size?.width ?? 820);
        }
        return out;
    }, [pages, document.pagePresetsById]);

    const getPageWidth = (pageId: string) => pageWidthById.get(pageId) ?? 820;

    const isProgrammaticScrollRef = useRef(false);


    const {
        scrollToPage,
        markManualSelect,
        registerPageRef,
        lastManualSelectAtRef,
    } = useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef });

    const GAP_PX = 36;

    const pageMetrics = useMemo(() => {
        const presetById = document.pagePresetsById ?? ({} as any);
        const offsets: number[] = [];
        const heights: number[] = [];

        let acc = 0;
        for (let i = 0; i < pages.length; i++) {
            const pg = pages[i];
            const h = presetById[pg.presetId]?.size?.height ?? 1100;

            offsets.push(acc);
            heights.push(h);

            acc += h;
            if (i < pages.length - 1) acc += GAP_PX;
        }
        return { offsets, heights };
    }, [pages, document.pagePresetsById, GAP_PX]);



    const [viewportAnchorIndex, setViewportAnchorIndex] = React.useState(0);

    useEffect(() => {
        if (mode !== "scroll") return;
        if (!rootEl) return;
        if (pageMetrics.offsets.length === 0) return;

        let raf = 0;

        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const midPx = (rootEl.scrollTop + rootEl.clientHeight * 0.5) / zoom;
                const idx = findAnchorIndex(midPx, pageMetrics.offsets);
                const safeIdx = Math.max(0, Math.min(pageMetrics.offsets.length - 1, idx));
                setViewportAnchorIndex(prev => (prev === safeIdx ? prev : safeIdx));
            });
        };

        rootEl.addEventListener("scroll", onScroll, { passive: true });
        onScroll(); // init
        return () => {
            cancelAnimationFrame(raf);
            rootEl.removeEventListener("scroll", onScroll);
        };
    }, [mode, rootEl, zoom, pageMetrics]);

    const [forcedAnchorIndex, setForcedAnchorIndex] = React.useState<number | null>(null);
    // ✅ scroll เฉพาะตอน “เลือกเอง”
    useEffect(() => {
        if (mode !== "scroll") return;
        if (!activePageId) return;
        if (!rootEl) return;
        if (forcedAnchorIndex !== null) return;

        scrollToPage(activePageId);
    }, [mode, activePageId, rootEl, scrollToPage, forcedAnchorIndex]);

    const nodesMock = usePageNodesMock(document);

    useEffect(() => {
        if (mode !== "scroll") return;
        if (!activePageId) return;
        nodesMock.ensureAround(activePageId, 2); // prefetch ±2
    }, [mode, activePageId, nodesMock]);



    const anchorIndex = Math.max(
        0,
        Math.min(pages.length - 1, forcedAnchorIndex ?? viewportAnchorIndex)
    );
    /* ---------- render ---------- */
    if (mode === "scroll") {
        return (
            <div style={{ padding: 24 }}>
                <div style={{ zoom }}>
                    {pages.map((p, idx) => {
                        const dist = Math.abs(idx - anchorIndex);
                        const level = getLevel(dist, 2, 8);

                        return (
                            <React.Fragment key={p.id}>
                                <VirtualPage

                                    document={document}
                                    page={p}
                                    showMargin={showMargin}
                                    active={p.id === activePageId}
                                    level={level}          // ✅ เพิ่มบรรทัดนี้
                                    onActivate={() => {
                                        if (p.id === activePageId) return;
                                        markManualSelect();
                                        setActivePageId?.(p.id);

                                        const targetIdx = idx; // เพราะอยู่ใน map แล้ว
                                        setForcedAnchorIndex(targetIdx);

                                        requestAnimationFrame(() => {
                                            scrollToPage(p.id);
                                            // ปล่อยให้ viewportAnchor กลับมาคุมเองหลัง scroll เสร็จสักนิด
                                            setTimeout(() => setForcedAnchorIndex(null), 200);
                                        });
                                    }}
                                    registerRef={(el) => registerPageRef(p.id, el)}
                                    loading={nodesMock.isLoading(p.id) && p.id === activePageId}
                                />
                                {idx < pages.length - 1 && (
                                    <GapAdd
                                        width={getPageWidth(p.id)}
                                        onAdd={() => {
                                            markManualSelect();
                                            onAddPageAfter?.(p.id);
                                        }}
                                    />
                                )}
                            </React.Fragment>
                        )
                    })}

                    {pages.length > 0 && (
                        <GapAdd
                            width={getPageWidth(pages[pages.length - 1].id)}
                            onAdd={() => {
                                markManualSelect();
                                onAddPageAfter?.(pages[pages.length - 1].id);
                            }}
                        />
                    )}
                </div>
            </div>
        );
    }

    /* ---------- single page mode ---------- */
    const page = activePageId ? (document.pagesById?.[activePageId] ?? null) : null;
    if (!page) return <div>no page</div>;

    return (
        <div style={{ padding: 24 }}>
            <div style={{ zoom }}>
                <PageView
                    document={document}
                    page={page}
                    showMargin={showMargin}
                    active
                    onActivate={() => {
                        markManualSelect();
                        setActivePageId?.(page.id);
                    }}
                />
            </div>
        </div>
    );
}
