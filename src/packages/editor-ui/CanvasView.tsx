"use client";

import React, { useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";

import type { DocumentJson, PageJson, Id } from "../editor-core/schema";

import { GapAdd } from "./components/GapAdd";
import { VirtualPage } from "./components/VirtualPage";
import { PageView } from "./components/PageView";

import { useScrollToPage } from "./hooks/useScrollToPage";

import { usePageNodesMock } from "./hooks/usePageNodesMock";
import { usePageNavigator } from "./hooks/usePageNavigator";
import { useEditorSessionStore } from "./store/editorStore";

export type CanvasNavigatorHandle = {
    navigateToPage: (pageId: string, opts?: {
        source?: "pagesPanel" | "thumbs" | "canvas" | "system";
        behavior?: "jump" | "smooth" | "auto";
        smoothDistancePages?: number;
    }) => void;
};

type CanvasViewProps = {
    document: DocumentJson;
    showMargin?: boolean;
    mode?: CanvasMode;
    onAddPageAfter?: (pageId: string) => Id | null;
    scrollRootRef?: React.RefObject<HTMLElement | null>;
    onViewingPageIdChange?: (pageId: string | null) => void;
};

type CanvasMode = "single" | "scroll";
type PageRenderLevel = "full" | "skeleton" | "none";
function getLevel(dist: number, fullR = 2, skelR = 8): PageRenderLevel {
    if (dist <= fullR) return "full";
    if (dist <= skelR) return "skeleton";
    return "none";
}




export const CanvasView = forwardRef<CanvasNavigatorHandle, CanvasViewProps>(
    function CanvasView(
        {
            document,

            showMargin = true,
            mode = "single",
            onAddPageAfter,

            scrollRootRef,
            onViewingPageIdChange,
        },
        ref
    ) {
        /* ---------- shared refs ---------- */
        const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
        const rootEl = scrollRootRef?.current ?? null;
        const pendingNavRef = useRef<Id | null>(null);
        const { session, setActivePage } = useEditorSessionStore();
        const activePageId = session.activePageId;
        const zoom = session.zoom;

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

        const GAP_PX = 36;

        const pageMetrics = useMemo(() => {
            const presetById = document.pagePresetsById ?? ({} as any);
            const offsets: number[] = [];
            const heights: number[] = [];

            let acc = 0;
            for (let i = 0; i < pages.length; i++) {
                const pg = pages[i];
                const h = presetById[pg.presetId]?.size?.height ?? 1100;

                const hz = h * (zoom || 1);
                offsets.push(acc);
                heights.push(hz);

                acc += hz;
                if (i < pages.length - 1) acc += GAP_PX * (zoom || 1);
            }
            return { offsets, heights };
        }, [pages, document.pagePresetsById, GAP_PX, zoom]);


        const isProgrammaticScrollRef = useRef(false);

        const { scrollToPage, markManualSelect, registerPageRef, lastManualSelectAtRef } =
            useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef });

        const nodesMock = usePageNodesMock(document);

        const nav = usePageNavigator({
            mode,
            pages,
            pageMetrics,
            zoom,
            rootEl,

            scrollToPage,
            markManualSelect,
            lastManualSelectAtRef,

            activePageId,
            setActivePageId: (id: string) => setActivePage(id),
            onViewingPageIdChange,

            ensureAround: (pageId, r) => nodesMock.ensureAround(pageId, r),
            preloadRadius: 2,
            isProgrammaticScrollRef,
        });

        // ✅ ตรงนี้แหละ: เปิด API ให้คนนอกเรียกได้
        useImperativeHandle(ref, () => ({
            navigateToPage: nav.navigateToPage,
        }), [nav.navigateToPage]);

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
        const GAP_RADIUS = 1; // ลอง 1 ก่อน ถ้ายังอยากให้กดเพิ่มหน้าได้ไกล ๆ ค่อยเพิ่มเป็น 2
        const indexById = useMemo(() => {
            const m: Record<string, number> = {};
            pages.forEach((p, i) => (m[p.id] = i));
            return m;
        }, [pages]);

        const activeIndex = activePageId ? (indexById[activePageId] ?? -1) : -1;

        const shouldRenderGap2 = (idx: number) =>
            Math.abs(idx - anchorIndex) <= GAP_RADIUS ||
            (activeIndex >= 0 && Math.abs(idx - activeIndex) <= GAP_RADIUS);

        const z = zoom || 1;
        /* ---------- render ---------- */
        if (mode === "scroll") {
            return (
                <div style={{ padding: 24 }}>
                    {pages.map((p, idx) => {
                        const dist = Math.abs(idx - anchorIndex);
                        const level = getLevel(dist, 2, 8);

                        const preset = document.pagePresetsById?.[p.presetId];
                        const pageW = preset?.size?.width ?? 820;
                        const pageH = preset?.size?.height ?? 1100;
                        const z = zoom || 1;

                        return (
                            <React.Fragment key={p.id}>
                                <div
                                    style={{
                                        width: pageW * z,
                                        height: pageH * z,
                                        position: "relative",
                                        margin: "0 auto", // ให้จัดกลางเหมือนเดิม
                                    }}
                                    ref={(el) => registerPageRef(p.id, el)}
                                >
                                    <div
                                        style={{
                                            transform: `scale(${z})`,
                                            transformOrigin: "top left",
                                            width: pageW,
                                            height: pageH,
                                        }}
                                    >
                                        <VirtualPage
                                            document={document}
                                            page={p}
                                            showMargin={showMargin}
                                            active={p.id === activePageId}
                                            level={level}
                                            onActivate={() => {
                                                if (p.id === activePageId) return;
                                                nav.navigateToPage(p.id, { source: "canvas", behavior: "auto", smoothDistancePages: 5 });
                                            }}

                                            loading={nodesMock.isLoading(p.id) && p.id === pages[anchorIndex]?.id}

                                        />
                                    </div>
                                </div>

                                {/* GAP */}
                                {idx < pages.length - 1 && (
                                    shouldRenderGap2(idx) ? (
                                        <div
                                            style={{
                                                width: pageW * z,
                                                height: GAP_PX * z,      // ✅ layout gap จริง = คูณ z
                                                margin: "0 auto",
                                                position: "relative",
                                            }}
                                        >
                                            <div style={{
                                                transform: `scale(${z})`,
                                                transformOrigin: "top left",
                                                width: pageW,
                                                height: GAP_PX,
                                            }}>
                                                <GapAdd
                                                    width={pageW}
                                                    scrollRoot={rootEl}
                                                    armDelayMs={200}
                                                    onAdd={() => {
                                                        markManualSelect();
                                                        const newId = onAddPageAfter?.(p.id);
                                                        if (!newId) return;
                                                        pendingNavRef.current = newId;
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ height: GAP_PX * z }} />
                                    )
                                )}
                            </React.Fragment>
                        );
                    })}

                    {pages.length > 0 && (
                        shouldRenderGap2(pages.length - 1) ? (
                            (() => {
                                const last = pages[pages.length - 1];
                                const preset = document.pagePresetsById?.[last.presetId];
                                const pageW = preset?.size?.width ?? 820;
                                return (
                                    <div style={{ width: pageW * z, height: GAP_PX * z, margin: "0 auto", position: "relative" }}>
                                        <div style={{ transform: `scale(${z})`, transformOrigin: "top left", width: pageW, height: GAP_PX }}>
                                            <GapAdd
                                                width={pageW}
                                                scrollRoot={rootEl}
                                                armDelayMs={200}
                                                onAdd={() => {
                                                    markManualSelect();
                                                    const lastId = pages[pages.length - 1].id;
                                                    const newId = onAddPageAfter?.(lastId);
                                                    if (!newId) return;
                                                    setActivePage(newId);

                                                    pendingNavRef.current = newId;
                                                }} />
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            <div style={{ height: GAP_PX * z }} />
                        )
                    )}

                </div>
            );
        }

        /* ---------- single page mode ---------- */
        const page = activePageId ? (document.pagesById?.[activePageId] ?? null) : null;
        if (!page) return <div>no page</div>;
        const preset = document.pagePresetsById?.[page.presetId];
        const pageW = preset?.size?.width ?? 820;
        const pageH = preset?.size?.height ?? 1100;

        return (
            <div style={{ padding: 24 }}>
                <div style={{ width: pageW * z, height: pageH * z, margin: "0 auto", position: "relative" }}>
                    <div style={{ transform: `scale(${z})`, transformOrigin: "top left", width: pageW, height: pageH }}>
                        <PageView
                            document={document}
                            page={page}
                            showMargin={showMargin}
                            active
                            onActivate={() => {
                                markManualSelect();
                                setActivePage(page.id);

                            }}
                        />
                    </div>
                </div>
            </div>
        );


    }
);
