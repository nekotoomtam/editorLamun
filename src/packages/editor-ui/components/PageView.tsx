"use client";

import React, { useMemo } from "react";
import type { DocumentJson, PageJson } from "../../editor-core/schema";
import { NodeView } from "./NodeView";

export function PageView({
    document,
    page,
    showMargin,
    active,
    onActivate,
    registerRef,
    loading,
    renderNodes = true,
    thumbPreview = false,
}: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
    registerRef?: (el: HTMLDivElement | null) => void;
    loading?: boolean;
    renderNodes?: boolean;
    thumbPreview?: boolean;
}) {
    // ✅ preset lookup แบบใหม่
    const preset = document.pagePresetsById?.[page.presetId] ?? null;
    if (!preset) return <div>no preset</div>;

    // ✅ nodes lookup แบบใหม่ (byId + order)
    const nodes = useMemo(() => {
        if (!renderNodes) return [];

        const order = document.nodeOrderByPageId?.[page.id] ?? [];
        let list = order
            .map(id => document.nodesById?.[id])
            .filter(n => n && n.visible !== false);

        // thumb preview เอาแค่ text + จำกัดจำนวน
        if (thumbPreview) {
            list = list.filter(n => n.type === "text").slice(0, 8);
        }

        return list;
    }, [
        document.nodeOrderByPageId,
        document.nodesById,
        page.id,
        renderNodes,
        thumbPreview,
    ]);

    // ✅ margin override
    const margin = page?.marginOverride
        ? { ...preset.margin, ...page?.marginOverride }
        : preset.margin;

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
            {loading && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.55)",
                        zIndex: 10,
                    }}
                >
                    <div
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            border: "3px solid rgba(0,0,0,0.15)",
                            borderTopColor: "rgba(0,0,0,0.55)",
                            animation: "spin 0.9s linear infinite",
                        }}
                    />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

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

            {renderNodes &&
                nodes.map(n => (
                    <NodeView
                        key={n.id}
                        node={n}
                        document={document}
                    />
                ))}
        </div>
    );
}
