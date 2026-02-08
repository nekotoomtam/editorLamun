"use client";

import React from "react";
import type { DocumentJson, NodeJson, AssetImage } from "../../editor-core/schema";
import { useEditorSessionStore } from "../store/editorStore";

type ImageFit = "contain" | "cover" | "stretch";
const fitMap: Record<ImageFit, React.CSSProperties["objectFit"]> = {
    contain: "contain",
    cover: "cover",
    stretch: "fill",
};

export function NodeView({
    node,
    doc,
    offsetX = 0,
    offsetY = 0,
}: {
    node: NodeJson;
    doc: DocumentJson;
    offsetX?: number;
    offsetY?: number;
}) {
    const { session, setSelectedNodeIds } = useEditorSessionStore();

    const selected = (session.selectedNodeIds ?? []).includes(node.id);
    const locked = (node as any).locked === true;

    const base: React.CSSProperties = {
        position: "absolute",
        left: (node.x ?? 0) + offsetX,
        top: (node.y ?? 0) + offsetY,
        width: node.w ?? 0,
        height: node.h ?? 0,
        boxSizing: "border-box",
        userSelect: "none",
        pointerEvents: locked ? "none" : "auto",
    };

    const outline: React.CSSProperties = selected
        ? { outline: "2px solid rgba(59,130,246,0.95)", outlineOffset: 1 }
        : { outline: "1px dashed rgba(156,163,175,0.9)", outlineOffset: 0 };

    const onPick: React.PointerEventHandler<HTMLDivElement> = (e) => {
        e.stopPropagation();

        const ids = session.selectedNodeIds ?? [];
        if (e.shiftKey) {
            if (ids.includes(node.id)) setSelectedNodeIds(ids.filter((x) => x !== node.id));
            else setSelectedNodeIds([...ids, node.id]);
            return;
        }
        setSelectedNodeIds([node.id]);
    };

    if (node.type === "box") {
        return (
            <div
                style={{
                    ...base,
                    ...outline,
                    background: node.style.fill ?? "transparent",
                    border: `1px solid ${node.style.stroke ?? "rgba(0,0,0,0.25)"}`,
                    borderRadius: node.style.radius ?? 0,
                    opacity: (node as any).opacity ?? 1,
                }}
                onPointerDown={onPick}
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
                    ...outline,
                    padding: 2,
                    overflow: "hidden",
                    fontFamily: st.fontFamily,
                    fontSize: st.fontSize,
                    lineHeight: `${st.lineHeight}px`,
                    color: st.color ?? "#111827",
                    fontWeight: st.bold ? 700 : 400,
                    fontStyle: st.italic ? "italic" : "normal",
                    textDecoration: st.underline ? "underline" : "none",
                    textAlign: st.align,
                    opacity: (node as any).opacity ?? 1,
                    whiteSpace: "pre-wrap",
                }}
                onPointerDown={onPick}
                title={node.name ?? node.id}
            >
                {node.text}
            </div>
        );
    }

    if (node.type === "image") {
        const a = doc.assets?.imagesById?.[node.assetId] as AssetImage | undefined;
        if (!a) return null;

        return (
            <div style={{ ...base, ...outline, overflow: "hidden" }} onPointerDown={onPick} title={node.name ?? node.id}>
                <img
                    src={(a as any).src ?? (a as any).url}
                    alt={node.name ?? "image"}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: fitMap[((node as any).fit as ImageFit) ?? "contain"],
                        opacity: (node as any).opacity ?? 1,
                        display: "block",
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ ...base, ...outline, background: "rgba(255,255,255,0.35)" }} onPointerDown={onPick} title={node.name ?? node.id}>
            {node.type}
        </div>
    );
}
