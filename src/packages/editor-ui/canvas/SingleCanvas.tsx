import React from "react";

import type { DocumentJson, Id, PageJson } from "../../editor-core/schema";

import { PageView } from "../components/PageView";
import { CANVAS_CONFIG } from "./canvasConfig";

export function SingleCanvas(props: {
    document: DocumentJson;
    activePageId: Id | null;
    showMargin: boolean;
    zoom: number;
    markManualSelect: () => void;
    setActivePageId: (id: Id | null) => void;
}) {
    const { document, activePageId, showMargin, zoom, markManualSelect, setActivePageId } = props;

    const page = activePageId ? (document.pagesById?.[activePageId] as PageJson | undefined) : undefined;
    if (!page) return <div>no page</div>;

    const preset = document.pagePresetsById?.[page.presetId];
    const pageW = preset?.size?.width ?? 820;
    const pageH = preset?.size?.height ?? 1100;

    return (
        <div style={{ padding: CANVAS_CONFIG.paddingPx }}>
            <div style={{ width: pageW * zoom, height: pageH * zoom, margin: "0 auto", position: "relative" }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: pageW, height: pageH }}>
                    <PageView
                        document={document}
                        page={page}
                        showMargin={showMargin}
                        active
                        onActivate={() => {
                            markManualSelect();
                            setActivePageId(page.id);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
