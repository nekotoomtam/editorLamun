"use client";

import React from "react";
import type { DocumentJson, NodeJson, AssetImage, Id, NodeOwner } from "../../editor-core/schema";
import { pt100ToPx } from "../utils/units";
import { useEditorSessionStore } from "../store/editorStore";
import { clientToPagePoint } from "../utils/coords";

type ImageFit = "contain" | "cover" | "stretch";
const fitMap: Record<ImageFit, React.CSSProperties["objectFit"]> = {
    contain: "contain",
    cover: "cover",
    stretch: "fill",
};

export type NodeDragStartPayload = {
    nodeId: Id;
    startPagePt: { xPt: number; yPt: number };
    startNodePosPt100: { x: number; y: number };
    nodeSizePt100: { w: number; h: number };
    ownerKind: NodeOwner["kind"];
    pointerId: number;
};

type DragPreview = {
    nodeId: Id;
    x: number;
    y: number;
};

type NodeViewProps = {
    node: NodeJson;
    doc: DocumentJson;
    // node.x/y are Pt100 in local space of the target zone; zoneOriginX/Y are the page-space Pt100 origin of that zone.
    zoneOriginX?: number;
    zoneOriginY?: number;
    pageWPt: number;
    pageHPt: number;
    pageEl?: HTMLElement | null;
    onStartNodeDrag?: (payload: NodeDragStartPayload) => void;
    dragPreview?: DragPreview | null;
};

function NodeViewInner({
    node,
    doc,
    zoneOriginX = 0,
    zoneOriginY = 0,
    pageWPt,
    pageHPt,
    pageEl = null,
    onStartNodeDrag,
    dragPreview = null,
}: NodeViewProps) {
    const { session, setSelectedNodeIds } = useEditorSessionStore();

    const selected = (session.selectedNodeIds ?? []).includes(node.id);
    const locked = (node as any).locked === true;

    const preview = dragPreview && dragPreview.nodeId === node.id ? dragPreview : null;
    const nodeX = preview?.x ?? node.x ?? 0;
    const nodeY = preview?.y ?? node.y ?? 0;
    const leftPt = nodeX + zoneOriginX;
    const topPt = nodeY + zoneOriginY;
    const widthPt = node.w ?? 0;
    const heightPt = node.h ?? 0;

    const base: React.CSSProperties = {
        position: "absolute",
        left: pt100ToPx(leftPt),
        top: pt100ToPx(topPt),
        width: pt100ToPx(widthPt),
        height: pt100ToPx(heightPt),
        boxSizing: "border-box",
        userSelect: "none",
        cursor: "default",
        pointerEvents: locked ? "none" : "auto",
    };

    const outline: React.CSSProperties = selected
        ? { outline: "2px solid rgba(59,130,246,0.95)", outlineOffset: 1 }
        : { outline: "1px dashed rgba(156,163,175,0.9)", outlineOffset: 0 };

    const onPick: React.PointerEventHandler<HTMLDivElement> = (e) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedNodeIds([node.id]);
    };

    const onPointerDownBox: React.PointerEventHandler<HTMLDivElement> = (e) => {
        onPick(e);
        if (!onStartNodeDrag) return;
        if (e.button !== 0) return;
        if (!pageEl || locked) return;

        try {
            (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
        } catch { }

        const start = clientToPagePoint(pageEl, e.clientX, e.clientY, pageWPt, pageHPt);
        onStartNodeDrag({
            nodeId: node.id,
            startPagePt: { xPt: start.xPt, yPt: start.yPt },
            startNodePosPt100: { x: node.x ?? 0, y: node.y ?? 0 },
            nodeSizePt100: { w: node.w ?? 0, h: node.h ?? 0 },
            ownerKind: node.owner.kind,
            pointerId: e.pointerId,
        });
    };

    if (node.type === "box") {
        const borderWidthPx = pt100ToPx(node.style.strokeWidth ?? 100);
        return (
            <div
                style={{
                    ...base,
                    ...outline,
                    background: node.style.fill ?? "transparent",
                    borderStyle: "solid",
                    borderWidth: borderWidthPx,
                    borderColor: node.style.stroke ?? "rgba(0,0,0,0.25)",
                    borderRadius: pt100ToPx(node.style.radius ?? 0),
                    opacity: (node as any).opacity ?? 1,
                }}
                onPointerDown={onPointerDownBox}
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
                    fontSize: pt100ToPx(st.fontSize ?? 0),
                    lineHeight: `${pt100ToPx(st.lineHeight ?? 0)}px`,
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

export const NodeView = React.memo(NodeViewInner, (prev, next) => {
    if (prev.node !== next.node) return false;
    if (prev.doc !== next.doc) return false;
    if (prev.zoneOriginX !== next.zoneOriginX || prev.zoneOriginY !== next.zoneOriginY) return false;
    if (prev.pageWPt !== next.pageWPt || prev.pageHPt !== next.pageHPt) return false;
    if (prev.pageEl !== next.pageEl) return false;
    if (prev.onStartNodeDrag !== next.onStartNodeDrag) return false;

    const id = prev.node.id;
    const prevHit = prev.dragPreview?.nodeId === id;
    const nextHit = next.dragPreview?.nodeId === id;
    if (prevHit !== nextHit) return false;
    if (!prevHit && !nextHit) return true;
    if (!prev.dragPreview || !next.dragPreview) return false;
    return prev.dragPreview.x === next.dragPreview.x && prev.dragPreview.y === next.dragPreview.y;
});
