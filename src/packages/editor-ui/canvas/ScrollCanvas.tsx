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

    const { scrollToPage, markManualSelect, registerPageRef, lastManualSelectAtRef } =
        useScrollToPage({ rootEl, pageRefs, isProgrammaticScrollRef });

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

    // index lookup for gap rendering
    const indexById = React.useMemo(() => {
        const m: Record<string, number> = {};
        pages.forEach((p, i) => (m[p.id] = i));
        return m;
    }, [pages]);

    const anchorIndex = nav.anchorIndex;
    const activeIndex = activePageId ? (indexById[activePageId] ?? -1) : -1;
    const GAP_RADIUS = 1;

    const shouldRenderGap = (idx: number) =>
        Math.abs(idx - anchorIndex) <= GAP_RADIUS ||
        (activeIndex >= 0 && Math.abs(idx - activeIndex) <= GAP_RADIUS);

    return (
        <div style={{ padding: 24 }}>
            {pages.map((p, idx) => {
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

                        {idx < pages.length - 1 && (
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
        </div>
    );
}
