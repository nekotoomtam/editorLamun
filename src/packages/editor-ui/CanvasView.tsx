"use client";

import React, { forwardRef, useImperativeHandle, useRef } from "react";

import type { DocumentJson, Id } from "../editor-core/schema";

import { useEditorSessionStore } from "./store/editorStore";

import { usePageList } from "./canvas/hooks/usePageList";
import { usePageMetrics } from "./canvas/hooks/usePageMetrics";
import { ScrollCanvas } from "./canvas/ScrollCanvas";
import { SingleCanvas } from "./canvas/SingleCanvas";

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
        const { session, setActivePage } = useEditorSessionStore();
        const activePageId = session.activePageId;
        const zoom = session.zoom || 1;

        const { pages } = usePageList(document);
        const pageMetrics = usePageMetrics({ document, pages, zoom, gapPx: 36 });

        // Used by single mode to preserve the same "manual select" semantics (for future nav logic).
        const lastManualSelectAtRef = useRef(0);
        const markManualSelect = () => {
            lastManualSelectAtRef.current = performance.now();
        };

        // In single mode we still expose the same API surface (navigate simply sets active page).
        if (mode !== "scroll") {
            useImperativeHandle(ref, () => ({
                navigateToPage: (pageId: string) => {
                    setActivePage(pageId as any);
                },
            }), [setActivePage]);
        }

        if (mode === "scroll") {
            return (
                <ScrollCanvas
                    document={document}
                    pages={pages}
                    pageMetrics={pageMetrics}
                    zoom={zoom}
                    showMargin={showMargin}
                    activePageId={activePageId}
                    setActivePageId={(id) => setActivePage(id)}
                    onAddPageAfter={onAddPageAfter}
                    scrollRootRef={scrollRootRef}
                    onViewingPageIdChange={onViewingPageIdChange}
                    refHandle={ref}
                />
            );
        }

        return (
            <SingleCanvas
                document={document}
                activePageId={activePageId}
                showMargin={showMargin}
                zoom={zoom}
                markManualSelect={markManualSelect}
                setActivePageId={(id) => setActivePage(id)}
            />
        );
    }
);
