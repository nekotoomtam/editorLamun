"use client";

import React from "react";
import type { DocumentJson, NodeJson, AssetImage } from "../../editor-core/schema";

type ImageFit = "contain" | "cover" | "stretch";
const fitMap: Record<ImageFit, React.CSSProperties["objectFit"]> = {
    contain: "contain",
    cover: "cover",
    stretch: "fill",
};

export function NodeView({ node, document }: { node: NodeJson; document: DocumentJson }) {
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
        const img: AssetImage | undefined = document.assets?.images.find((i) => i.id === node.assetId);
        const src = img?.src ?? "";

        return (
            <img
                src={src}
                alt={node.name ?? node.id}
                style={{
                    ...base,
                    objectFit: fitMap[(node as any).fit as ImageFit],
                    opacity: (node as any).opacity ?? 1,
                    display: "block",
                }}
            />
        );
    }

    return (
        <div style={{ ...base, border: "1px dashed #9ca3af" }} title={node.name ?? node.id}>
            group
        </div>
    );
}
