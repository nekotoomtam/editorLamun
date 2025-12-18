"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { DocumentJson, PageJson } from "../editor-core/schema";

import { GapAdd } from "./components/GapAdd";
import { VirtualPage } from "./components/VirtualPage";
import { PageView } from "./components/PageView";

import { useScrollToPage } from "./hooks/useScrollToPage";
import { useActivePageFromScroll } from "./hooks/useActivePageFromScroll";
import { usePageNodesMock } from "./hooks/usePageNodesMock";

type CanvasMode = "single" | "scroll";

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
    const activeFromScrollRef = useRef(false);

    const {
        scrollToPage,
        markManualSelect,
        registerPageRef,
        lastManualSelectAtRef,
    } = useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef });

    useActivePageFromScroll({
        rootEl,
        pageRefs,
        activePageId,
        onChange: setActivePageId,
        isProgrammaticScrollRef,
        lastManualSelectAtRef,
        activeFromScrollRef,
    });

    // ✅ scroll เฉพาะตอน “เลือกเอง”
    useEffect(() => {
        if (mode !== "scroll") return;
        if (!activePageId) return;
        if (!rootEl) return;

        // ถ้า active มาจากการเลื่อน -> ห้ามดูด
        if (activeFromScrollRef.current) {
            activeFromScrollRef.current = false;
            return;
        }

        scrollToPage(activePageId);
    }, [mode, activePageId, rootEl, scrollToPage]);

    const nodesMock = usePageNodesMock(document);

    useEffect(() => {
        if (mode !== "scroll") return;
        if (!activePageId) return;
        nodesMock.ensureAround(activePageId, 2); // prefetch ±2
    }, [mode, activePageId, nodesMock]);

    /* ---------- render ---------- */
    if (mode === "scroll") {
        return (
            <div style={{ padding: 24 }}>
                <div style={{ zoom }}>
                    {pages.map((p, idx) => (
                        <React.Fragment key={p.id}>
                            <VirtualPage
                                rootEl={rootEl}
                                document={document}
                                page={p}
                                showMargin={showMargin}
                                active={p.id === activePageId}
                                onActivate={() => {
                                    markManualSelect();
                                    setActivePageId?.(p.id);
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
                    ))}

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
