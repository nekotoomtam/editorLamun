"use client";

import React, { useMemo } from "react";
import type { DocumentJson, PageJson, PagePreset } from "../../editor-core/schema";
import { NodeView } from "./NodeView";

export function PageView({
    document,
    page,
    showMargin,
    active,
    onActivate,
    registerRef,
}: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
    registerRef?: (el: HTMLDivElement | null) => void;
}) {
    const preset: PagePreset | null = document.pagePresets.find((pp) => pp.id === page.presetId) ?? null;
    if (!preset) return <div>no preset</div>;

    const nodes = useMemo(() => {
        return document.nodes
            .filter((n) => n.pageId === page.id && n.visible !== false)
            .slice()
            .sort((a, b) => a.z - b.z);
    }, [document.nodes, page.id]);

    const margin = page.override?.margin ? { ...preset.margin, ...page.override.margin } : preset.margin;

    return (
        <div
            ref={registerRef}
            style={{
                position: "relative",
                width: preset.size.width,
                height: preset.size.height,
                background: "#ffffff",
                margin: "0 auto",
                boxShadow: active
                    ? "0 10px 26px rgba(0,0,0,0.10), 0 0 30px rgba(59,130,246,0.28)"
                    : "0 10px 26px rgba(0,0,0,0.10)",
            }}
            onMouseDown={() => onActivate?.()}
        >
            {showMargin && (
                <div
                    style={{
                        position: "absolute",
                        left: margin.left,
                        top: margin.top,
                        width: preset.size.width - margin.left - margin.right,
                        height: preset.size.height - margin.top - margin.bottom,
                        border: "1px dashed #9ca3af",
                        pointerEvents: "none",
                    }}
                    title="margin"
                />
            )}

            {nodes.map((n) => (
                <NodeView key={n.id} node={n} document={document} />
            ))}
        </div>
    );
}
