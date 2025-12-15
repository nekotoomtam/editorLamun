"use client";

import React, { useMemo, useState } from "react";
import type {
    AssetImage,
    DocumentJson,
    NodeJson,
    PageJson,
    PagePreset,
} from "../editor-core/schema";

type CanvasMode = "single" | "scroll";
type ImageFit = "contain" | "cover" | "stretch";

const fitMap: Record<ImageFit, React.CSSProperties["objectFit"]> = {
    contain: "contain",
    cover: "cover",
    stretch: "fill", // editor concept -> CSS value
};

export function CanvasView({
    document,
    activePageId,
    showMargin = false,
    mode = "single",
    onAddPageAfter,
    zoom = 1,
    setActivePageId
}: {
    document: DocumentJson;
    activePageId: string | null;
    showMargin?: boolean;
    mode?: CanvasMode;
    onAddPageAfter?: (pageId: string) => void;
    zoom?: number;
    setActivePageId?: (pageId: string) => void;
}) {




    if (mode === "scroll") {
        const pages = document.pages.slice().sort((a, b) => a.index - b.index);

        return (
            <div style={{ padding: 24 }}>
                <div
                    style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: "top center",
                    }}
                >
                    {pages.map((p, idx) => (
                        <React.Fragment key={p.id}>
                            <PageView
                                document={document}
                                page={p}
                                showMargin={showMargin}
                                active={p.id === activePageId}
                                onActivate={() => setActivePageId?.(p.id)}
                            />

                            {idx < pages.length - 1 && (
                                <GapAdd onAdd={() => onAddPageAfter?.(p.id)} />
                            )}
                        </React.Fragment>
                    ))}

                    {pages.length > 0 && (
                        <GapAdd onAdd={() => onAddPageAfter?.(pages[pages.length - 1].id)} />
                    )}
                </div>
            </div>
        );
    }


    // single page mode
    const page = document.pages.find((p) => p.id === activePageId) ?? null;
    if (!page) return <div>no page</div>;

    return (
        <div style={{ padding: 24 }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                <PageView
                    document={document}
                    page={page}
                    showMargin={showMargin}
                    active
                    onActivate={() => setActivePageId?.(page.id)}
                />
            </div>
        </div>
    );
}

function GapAdd({ onAdd, width = 820 }: { onAdd: () => void; width?: number }) {
    const [hover, setHover] = React.useState(false);

    return (
        <div
            onClick={onAdd}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                height: hover ? 72 : 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                userSelect: "none",
                transition: "height 120ms ease",
            }}
        >
            {/* wrapper ที่อิงความกว้าง page */}
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: width,
                    height: hover ? 56 : 8,
                    transition: "height 120ms ease",
                }}
            >
                {/* idle line */}
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: 2,
                        background: "rgba(0,0,0,0.15)",
                        opacity: hover ? 0 : 1,
                        transition: "opacity 120ms ease",
                    }}
                />

                {/* hover dashed frame */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        border: hover ? "2px dashed rgba(0,0,0,0.25)" : "2px dashed rgba(0,0,0,0)",
                        borderRadius: 10,
                        transition: "border-color 120ms ease",
                    }}
                />

                {/* plus button */}
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: hover ? 32 : 26,
                        height: hover ? 32 : 26,
                        borderRadius: 999,
                        border: "1px solid rgba(0,0,0,0.18)",
                        background: "rgba(255,255,255,0.95)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        boxShadow: hover ? "0 10px 22px rgba(0,0,0,0.14)" : "0 6px 14px rgba(0,0,0,0.10)",
                        transition: "all 120ms ease",
                    }}
                >
                    +
                </div>
            </div>
        </div>
    );
}

function PageView({
    document,
    page,
    showMargin,
    active,
    onActivate,
}: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
}) {
    const preset: PagePreset | null =
        document.pagePresets.find((pp) => pp.id === page.presetId) ?? null;

    if (!preset) return <div>no preset</div>;

    const nodes = useMemo(() => {
        return document.nodes
            .filter((n) => n.pageId === page.id && n.visible !== false)
            .slice()
            .sort((a, b) => a.z - b.z);
    }, [document.nodes, page.id]);

    const margin = page.override?.margin
        ? { ...preset.margin, ...page.override.margin }
        : preset.margin;

    const pageStyle: React.CSSProperties = {
        position: "relative",
        width: preset.size.width,
        height: preset.size.height,
        background: "#ffffff",
        margin: "0 auto",

        boxShadow: active
            ? "0 10px 26px rgba(0,0,0,0.10), 0 0 30px rgba(59,130,246,0.28)"
            : "0 10px 26px rgba(0,0,0,0.10)",
    };

    return (
        <div
            style={pageStyle}
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

function NodeView({ node, document }: { node: NodeJson; document: DocumentJson }) {
    const base: React.CSSProperties = {
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        pointerEvents: "auto",
        userSelect: "none",
    };

    if (node.type === "box") {
        const s = node.style;
        return (
            <div
                style={{
                    ...base,
                    background: s.fill ?? "transparent",
                    border: `${s.strokeWidth ?? 0}px solid ${s.stroke ?? "transparent"}`,
                    borderRadius: s.radius ?? 0,
                }}
                title={node.name ?? node.id}
            />
        );
    }

    if (node.type === "text") {
        const st = node.style;
        return (
            <div
                style={{
                    ...base,
                    fontFamily: st.fontFamily,
                    fontSize: st.fontSize,
                    lineHeight: `${st.lineHeight}px`,
                    fontWeight: st.bold ? 700 : 400,
                    fontStyle: st.italic ? "italic" : "normal",
                    textDecoration: st.underline ? "underline" : "none",
                    color: st.color ?? "#111827",
                    textAlign: st.align,
                    whiteSpace: "pre-wrap",
                    overflow: "hidden",
                }}
                title={node.name ?? node.id}
            >
                {node.text}
            </div>
        );
    }

    if (node.type === "image") {
        const img: AssetImage | undefined = document.assets?.images.find(
            (i) => i.id === node.assetId
        );
        const src = img?.src ?? "";

        return (
            <img
                src={src}
                alt={node.name ?? node.id}
                style={{
                    ...base,
                    objectFit: fitMap[node.fit],
                    opacity: node.opacity ?? 1,
                    display: "block",
                }}
            />
        );
    }

    // group (ยังไม่ render children ซ้อนในเฟสนี้)
    return (
        <div style={{ ...base, border: "1px dashed #9ca3af" }} title={node.name ?? node.id}>
            group
        </div>
    );
}
