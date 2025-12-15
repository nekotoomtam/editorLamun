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
    loading,
    renderNodes = true,    // ✅ เพิ่ม
    thumbPreview = false
}: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
    registerRef?: (el: HTMLDivElement | null) => void;
    loading?: boolean;
    renderNodes?: boolean;       // ✅ เพิ่ม
    thumbPreview?: boolean
}) {
    const preset = document.pagePresets.find(pp => pp.id === page.presetId) ?? null;
    if (!preset) return <div>no preset</div>;

    const nodes = useMemo(() => {
        if (!renderNodes) return [];
        let list = document.nodes
            .filter(n => n.pageId === page.id && n.visible !== false)
            .slice()
            .sort((a, b) => a.z - b.z);

        if (thumbPreview) {
            list = list
                .filter(n => n.type === "text")   // เอาแค่ text
                .slice(0, 8);                      // จำกัดจำนวน
        }
        return list;
    }, [document.nodes, page.id, renderNodes, thumbPreview]);

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

            {renderNodes && nodes.map(n => (   // ✅ กันไว้ชัด ๆ
                <NodeView key={n.id} node={n} document={document} />
            ))}
        </div>
    );
}
