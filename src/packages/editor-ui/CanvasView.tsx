"use client";

import React, { useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";

import type { DocumentJson, PageJson, Id } from "../editor-core/schema";

import { GapAdd } from "./components/GapAdd";
import { VirtualPage } from "./components/VirtualPage";
import { PageView } from "./components/PageView";

import { useScrollToPage } from "./hooks/useScrollToPage";

import { usePageNodesMock } from "./hooks/usePageNodesMock";
import { usePageNavigator } from "./hooks/usePageNavigator";


export type CanvasNavigatorHandle = {
    navigateToPage: (pageId: string, opts?: {
        source?: "pagesPanel" | "thumbs" | "canvas" | "system";
        behavior?: "jump" | "smooth" | "auto";
        smoothDistancePages?: number;
    }) => void;
};

type CanvasViewProps = {
    document: DocumentJson;
    activePageId: string | null;
    showMargin?: boolean;
    mode?: CanvasMode;
    onAddPageAfter?: (pageId: string) => Id | null;
    zoom?: number;
    setActivePageId?: (pageId: string) => void;
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
            activePageId,
            showMargin = false,
            mode = "single",
            onAddPageAfter,
            zoom = 1,
            setActivePageId,
            scrollRootRef,
            onViewingPageIdChange,
        },
        ref
    ) {
        /* ---------- shared refs ---------- */
        const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
        const rootEl = scrollRootRef?.current ?? null;
        const pendingNavRef = useRef<Id | null>(null);


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

                offsets.push(acc);
                heights.push(h);

                acc += h;
                if (i < pages.length - 1) acc += GAP_PX;
            }
            return { offsets, heights };
        }, [pages, document.pagePresetsById, GAP_PX]);

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
            setActivePageId,

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
                                        level={level}
                                        onActivate={() => {
                                            if (p.id === activePageId) return;

                                            nav.navigateToPage(p.id, {
                                                source: "canvas",
                                                behavior: "auto",
                                                smoothDistancePages: 5,
                                            });
                                        }}
                                        registerRef={(el) => registerPageRef(p.id, el)}
                                        loading={nodesMock.isLoading(p.id) && p.id === pages[anchorIndex]?.id}
                                    />

                                    {idx < pages.length - 1 && (
                                        <GapAdd
                                            width={getPageWidth(p.id)}
                                            onAdd={() => {
                                                markManualSelect();
                                                const newId = onAddPageAfter?.(p.id);
                                                if (!newId) return;

                                                setActivePageId?.(newId);

                                                // ✅ เก็บไว้ก่อน รอ pages update แล้วค่อย navigate ใน useEffect
                                                pendingNavRef.current = newId;
                                            }}
                                        />


                                    )}
                                </React.Fragment>
                            );
                        })}

                        {pages.length > 0 && (
                            <GapAdd
                                width={getPageWidth(pages[pages.length - 1].id)}
                                onAdd={() => {
                                    markManualSelect();
                                    const lastId = pages[pages.length - 1].id;
                                    const newId = onAddPageAfter?.(lastId);
                                    if (!newId) return;

                                    setActivePageId?.(newId);

                                    // ✅ เก็บไว้ก่อน รอ pages update แล้วค่อย navigate ใน useEffect
                                    pendingNavRef.current = newId;
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
);
