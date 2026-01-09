"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentJson, PageJson, PagePreset } from "../../editor-core/schema";
import { NodeView } from "./NodeView";
import * as Sel from "../../editor-core/schema/selectors";
import { useEditorStore } from "../store/editorStore"; // ✅ เพิ่ม

type Side = "top" | "right" | "bottom" | "left";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}
function roundInt(n: number) {
    return Math.round(n);
}

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
    const preset = document.pagePresetsById?.[page.presetId] ?? null;
    if (!preset) return <div>no preset</div>;

    const { updatePresetMargin, updatePageMargin } = useEditorStore();

    const nodes = useMemo(() => {
        if (!renderNodes) return [];
        const order = document.nodeOrderByPageId?.[page.id] ?? [];
        let list = order.map((id) => document.nodesById?.[id]).filter((n) => n && n.visible !== false);

        if (thumbPreview) {
            list = list.filter((n) => n.type === "text").slice(0, 8);
        }
        return list;
    }, [document.nodeOrderByPageId, document.nodesById, page.id, renderNodes, thumbPreview]);

    // ===== margin base (from doc) =====
    const baseMargin = Sel.getEffectiveMargin(document, page.id) ?? preset.margin;

    // ===== preview + dragging state =====
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [hoverSide, setHoverSide] = useState<Side | null>(null);
    const [dragSide, setDragSide] = useState<Side | null>(null);
    const [previewMargin, setPreviewMargin] = useState<PagePreset["margin"] | null>(null);
    const [limitSide, setLimitSide] = useState<Side | null>(null);

    // ใช้ margin สำหรับ render (ถ้ากำลังลาก ให้ใช้ preview)
    const margin = previewMargin ?? baseMargin;

    // content rect ใช้จาก selector (แต่ตอนลากเราอยากสะท้อน preview ด้วย)
    const content = useMemo(() => {
        const x = margin.left;
        const y = margin.top;
        const w = Math.max(0, preset.size.width - margin.left - margin.right);
        const h = Math.max(0, preset.size.height - margin.top - margin.bottom);
        return { x, y, w, h };
    }, [margin.left, margin.top, margin.right, margin.bottom, preset.size.width, preset.size.height]);

    // ===== drag math config =====
    const HIT = 6; // ระยะจับใกล้เส้น (px ใน page space)
    const MIN_CONTENT_W = 40;
    const MIN_CONTENT_H = 40;

    // drag context (เก็บไว้ใน ref เพื่อไม่ rerender ทุก move)
    const dragRef = useRef<null | {
        pageId: string;
        presetId: string;
        source: "preset" | "page";
        side: Side;
        startClientX: number;
        startClientY: number;
        scale: number; // client px -> page px
        startMargin: PagePreset["margin"];
        pageW: number;
        pageH: number;
    }>(null);

    const canDragPreset = !(preset.locked && (page.marginSource ?? "preset") === "preset");

    function clientToPageDelta(dxClient: number, dyClient: number, scale: number) {
        // scale = rect.width / pageW  => pageDelta = clientDelta / scale
        const s = scale || 1;
        return { dx: dxClient / s, dy: dyClient / s };
    }

    function hitTestSide(px: number, py: number, m: PagePreset["margin"], pageW: number, pageH: number): Side | null {
        // เส้นอยู่ตรงไหน
        const xL = m.left;
        const xR = pageW - m.right;
        const yT = m.top;
        const yB = pageH - m.bottom;

        // ใกล้เส้นไหน + อยู่ในช่วงระนาบนั้น
        // (เราให้จับได้ทั้งแนวของเส้น ไม่ต้องอยู่แค่ใน content)
        if (Math.abs(py - yT) <= HIT) return "top";
        if (Math.abs(py - yB) <= HIT) return "bottom";
        if (Math.abs(px - xL) <= HIT) return "left";
        if (Math.abs(px - xR) <= HIT) return "right";

        return null;
    }

    function applyDrag(
        side: Side,
        start: PagePreset["margin"],
        dx: number,
        dy: number,
        shift: boolean,
        pageW: number,
        pageH: number
    ): { margin: PagePreset["margin"]; hitLimit: boolean } {
        let next = { ...start };
        let hitLimit = false;

        const clampLeft = (v: number, rightFixed: number) => {
            const max = pageW - rightFixed - MIN_CONTENT_W;
            const c = clamp(v, 0, max);
            if (c !== v) hitLimit = true;
            return c;
        };

        const clampRight = (v: number, leftFixed: number) => {
            const max = pageW - leftFixed - MIN_CONTENT_W;
            const c = clamp(v, 0, max);
            if (c !== v) hitLimit = true;
            return c;
        };

        // ===== left / right =====
        if (side === "left" || side === "right") {
            const delta = side === "left" ? dx : -dx;

            if (!shift) {
                if (side === "left") next.left = clampLeft(start.left + delta, start.right);
                else next.right = clampRight(start.right + delta, start.left);
                return { margin: next, hitLimit };
            }

            // shift = symmetric (+delta เท่ากัน)
            const wanted = delta;
            const maxPos = (pageW - MIN_CONTENT_W - (start.left + start.right)) / 2;
            const maxNeg = Math.max(-start.left, -start.right);
            const d = clamp(wanted, maxNeg, maxPos);
            if (d !== wanted) hitLimit = true;

            next.left = start.left + d;
            next.right = start.right + d;
            return { margin: next, hitLimit };
        }

        // ===== top / bottom =====
        {
            const delta = side === "top" ? dy : -dy;

            const clampTop = (v: number, bottomFixed: number) => {
                const max = pageH - bottomFixed - MIN_CONTENT_H;
                const c = clamp(v, 0, max);
                if (c !== v) hitLimit = true;
                return c;
            };
            const clampBottom = (v: number, topFixed: number) => {
                const max = pageH - topFixed - MIN_CONTENT_H;
                const c = clamp(v, 0, max);
                if (c !== v) hitLimit = true;
                return c;
            };

            if (!shift) {
                if (side === "top") next.top = clampTop(start.top + delta, start.bottom);
                else next.bottom = clampBottom(start.bottom + delta, start.top);
                return { margin: next, hitLimit };
            }

            const wanted = delta;
            const maxPos = (pageH - MIN_CONTENT_H - (start.top + start.bottom)) / 2;
            const maxNeg = Math.max(-start.top, -start.bottom);
            const d = clamp(wanted, maxNeg, maxPos);
            if (d !== wanted) hitLimit = true;

            next.top = start.top + d;
            next.bottom = start.bottom + d;
            return { margin: next, hitLimit };
        }
    }


    // ===== pointer handlers =====
    function onPointerMoveLocal(e: React.PointerEvent) {
        if (dragRef.current) return; // ตอนลากให้ window handler จัดการ

        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const scale = rect.width / preset.size.width;

        const px = (e.clientX - rect.left) / scale;
        const py = (e.clientY - rect.top) / scale;

        const side = hitTestSide(px, py, baseMargin, preset.size.width, preset.size.height);

        // ถ้า preset locked และ source=preset => hover ได้แต่จะลากไม่ได้ (เพื่อให้รู้ว่ามีเส้น)
        setHoverSide(side);
    }

    function onPointerLeave() {
        if (dragRef.current) return;
        setHoverSide(null);
        setLimitSide(null);
    }

    function onPointerDown(e: React.PointerEvent) {
        if (thumbPreview) return;
        if (!hoverSide) return;

        const source = (page.marginSource ?? "preset") as "preset" | "page";
        if (source === "preset" && preset.locked) {
            // ลากไม่ได้ ต้องสลับเป็น page เอง
            return;
        }

        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const scale = rect.width / preset.size.width;

        dragRef.current = {
            pageId: page.id,
            presetId: preset.id,
            source,
            side: hoverSide,
            startClientX: e.clientX,
            startClientY: e.clientY,
            scale,
            startMargin: baseMargin, // เอาค่าจริงตอนเริ่มลาก
            pageW: preset.size.width,
            pageH: preset.size.height,
        };

        setDragSide(hoverSide);
        setPreviewMargin(baseMargin); // init preview
        e.preventDefault();
    }

    useEffect(() => {
        function onMove(ev: PointerEvent) {
            const ctx = dragRef.current;
            if (!ctx) return;

            const { dx, dy } = clientToPageDelta(ev.clientX - ctx.startClientX, ev.clientY - ctx.startClientY, ctx.scale);
            const shift = ev.shiftKey;

            const result = applyDrag(
                ctx.side,
                ctx.startMargin,
                dx,
                dy,
                shift,
                ctx.pageW,
                ctx.pageH
            );

            setPreviewMargin(result.margin);
            setLimitSide(result.hitLimit ? ctx.side : null);

        }

        function onUp(ev: PointerEvent) {
            const ctx = dragRef.current;
            if (!ctx) return;

            // commit ตอนปล่อยเท่านั้น
            const final = previewMargin ?? ctx.startMargin;

            // ปัดเป็น int ตอน commit
            const patch: Partial<PagePreset["margin"]> = {
                top: roundInt(final.top),
                right: roundInt(final.right),
                bottom: roundInt(final.bottom),
                left: roundInt(final.left),
            };

            if (ctx.source === "preset") {
                updatePresetMargin(ctx.presetId, patch);
            } else {
                updatePageMargin(ctx.pageId, patch);
            }

            // clear
            dragRef.current = null;
            setDragSide(null);
            setLimitSide(null);
            setPreviewMargin(null);
        }

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        // ⚠️ previewMargin ใช้ตอน commit ต้องอยู่ deps
    }, [previewMargin, updatePageMargin, updatePresetMargin]);

    // ===== show margin overlay? =====
    const shouldShowMargin = showMargin ?? (active && !thumbPreview);
    const isHovering = !!hoverSide;
    const isDragging = !!dragSide;

    // เส้นที่ hover/drag = highlight
    const highlightSide = dragSide ?? hoverSide;

    function lineStyle(active: boolean, limited: boolean) {
        return {
            background: limited ? "#ef4444" : active ? "#111827" : "rgba(17,24,39,0.15)",
            opacity: limited ? 0.9 : active ? 0.45 : 0.2,
            transition: "background 120ms ease, opacity 120ms ease",
        };
    }


    return (
        <div
            ref={(el) => {
                wrapRef.current = el;
                registerRef?.(el);
            }}
            style={{
                position: "relative",
                width: preset.size.width,
                height: preset.size.height,
                background: "#ffffff",
                margin: "0 auto",
                boxShadow: active
                    ? "0 10px 26px rgba(0,0,0,0.10), 0 0 30px rgba(59,130,246,0.28)"
                    : "0 10px 26px rgba(0,0,0,0.10)",
                // ให้รู้ว่าจับได้เมื่อ hover ใกล้เส้น
                cursor:
                    (highlightSide === "left" || highlightSide === "right")
                        ? "ew-resize"
                        : (highlightSide === "top" || highlightSide === "bottom")
                            ? "ns-resize"
                            : "default",
            }}
            onMouseDown={() => onActivate?.()}
            onPointerMove={onPointerMoveLocal}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
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

            {/* margin overlay */}
            {shouldShowMargin && (
                <>
                    {/* content rect dashed */}
                    <div
                        style={{
                            position: "absolute",
                            left: content.x,
                            top: content.y,
                            width: content.w,
                            height: content.h,
                            border: "1px dashed #9ca3af",
                            pointerEvents: "none",
                        }}
                        title="margin"
                    />

                    {/* hover highlight line (เบา ๆ) */}
                    {(isHovering || isDragging) && (
                        <>
                            {/* top line */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    top: margin.top,
                                    width: preset.size.width,
                                    height: 1,
                                    ...lineStyle(
                                        highlightSide === "top",
                                        limitSide === "top"
                                    ),
                                    pointerEvents: "none",
                                }}
                            />
                            {/* bottom line */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    top: preset.size.height - margin.bottom,
                                    width: preset.size.width,
                                    height: 1,
                                    ...lineStyle(highlightSide === "bottom", limitSide === "bottom"),
                                    pointerEvents: "none",
                                }}
                            />
                            {/* left line */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: margin.left,
                                    top: 0,
                                    width: 1,
                                    height: preset.size.height,
                                    ...lineStyle(highlightSide === "left", limitSide === "left"),
                                    pointerEvents: "none",
                                }}
                            />
                            {/* right line */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: preset.size.width - margin.right,
                                    top: 0,
                                    width: 1,
                                    height: preset.size.height,
                                    ...lineStyle(highlightSide === "right", limitSide === "right"),
                                    pointerEvents: "none",
                                }}
                            />
                        </>
                    )}

                    {/* locked hint (ถ้า hover เส้นแต่ลากไม่ได้) */}
                    {((page.marginSource ?? "preset") === "preset") && preset.locked && isHovering && (
                        <div
                            style={{
                                position: "absolute",
                                left: 10,
                                top: 10,
                                padding: "6px 8px",
                                borderRadius: 10,
                                background: "rgba(17,24,39,0.85)",
                                color: "#fff",
                                fontSize: 12,
                                pointerEvents: "none",
                            }}
                        >
                            Paper is locked — switch to “This page” to edit margin.
                        </div>
                    )}
                </>
            )}

            {renderNodes &&
                nodes.map((n) => (
                    <NodeView key={n.id} node={n} document={document} />
                ))}
        </div>
    );
}
