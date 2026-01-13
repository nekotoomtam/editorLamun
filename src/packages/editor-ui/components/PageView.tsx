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

    const {
        updatePresetMargin,
        updatePageMargin,
        session,
        setEditingTarget,
        getNodesByTarget,
        setSelectedNodeIds,
        updateRepeatAreaHeightPx,   // ✅ เพิ่ม
    } = useEditorStore();

    const editingTarget = session.editingTarget ?? "page";
    const HF_HIT = 6;

    const hfDragRef = useRef<null | {
        presetId: string;
        kind: "header" | "footer";
        startClientY: number;
        startHeaderH: number;
        startFooterH: number;
        scale: number;
        pageH: number;
        pointerId: number;

    }>(null);

    const [previewHeaderH, setPreviewHeaderH] = useState<number | null>(null);
    const [previewFooterH, setPreviewFooterH] = useState<number | null>(null);

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
    const hf = useMemo(() => Sel.getEffectiveHeaderFooterHeights(document, page.id), [document.headerFooterByPresetId, page.id, page.presetId, page.headerHidden, page.footerHidden]);
    const headerH = previewHeaderH ?? hf.headerH;
    const footerH = previewFooterH ?? hf.footerH;

    const hfRef = useRef(hf);
    useEffect(() => { hfRef.current = hf; }, [hf]);

    const previewHeaderHRef = useRef<number | null>(null);
    const previewFooterHRef = useRef<number | null>(null);
    useEffect(() => { previewHeaderHRef.current = previewHeaderH; }, [previewHeaderH]);
    useEffect(() => { previewFooterHRef.current = previewFooterH; }, [previewFooterH]);

    const pageW = preset.size.width;
    const pageH = preset.size.height;
    const bodyH = Math.max(0, pageH - headerH - footerH);
    const MAX_HEADER_PCT = 0.25;
    const MAX_FOOTER_PCT = 0.20;
    const MIN_BODY_H = 120; // หรือ 100 ตามใจตูม
    const MIN_HEADER_H = 0;
    const MIN_FOOTER_H = 0;

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
        const y = headerH + margin.top;
        const w = Math.max(0, pageW - margin.left - margin.right);
        const h = Math.max(0, bodyH - margin.top - margin.bottom);
        return { x, y, w, h };
    }, [margin.left, margin.top, margin.right, margin.bottom, headerH, bodyH, pageW]);


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
        bodyH: number;
        pointerId: number;
    }>(null);

    function clampHeader(nextHeaderH: number, footerH: number, pageH: number) {
        const maxByPct = pageH * MAX_HEADER_PCT;
        const maxByBody = pageH - footerH - MIN_BODY_H;
        const max = Math.min(maxByPct, maxByBody);
        return clamp(nextHeaderH, MIN_HEADER_H, Math.max(MIN_HEADER_H, max));
    }

    function clampFooter(nextFooterH: number, headerH: number, pageH: number) {
        const maxByPct = pageH * MAX_FOOTER_PCT;
        const maxByBody = pageH - headerH - MIN_BODY_H;
        const max = Math.min(maxByPct, maxByBody);
        return clamp(nextFooterH, MIN_FOOTER_H, Math.max(MIN_FOOTER_H, max));
    }

    function clientToPageDelta(dxClient: number, dyClient: number, scale: number) {
        // scale = rect.width / pageW  => pageDelta = clientDelta / scale
        const s = scale || 1;
        return { dx: dxClient / s, dy: dyClient / s };
    }

    function hitTestSide(px: number, py: number, m: PagePreset["margin"], pageW: number, pageH: number, headerH: number, footerH: number): Side | null {

        // เส้นอยู่ตรงไหน
        const xL = m.left;
        const xR = pageW - m.right;
        const yT = headerH + m.top;
        const yB = pageH - footerH - m.bottom;

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
        bodyH: number
    )
        : { margin: PagePreset["margin"]; hitLimit: boolean } {
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
                const max = bodyH - bottomFixed - MIN_CONTENT_H;
                const c = clamp(v, 0, max);
                if (c !== v) hitLimit = true;
                return c;
            };
            const clampBottom = (v: number, topFixed: number) => {
                const max = bodyH - topFixed - MIN_CONTENT_H;
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
            const maxPos = (bodyH - MIN_CONTENT_H - (start.top + start.bottom)) / 2;
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
        if (dragRef.current || hfDragRef.current) return;

        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const scale = rect.width / preset.size.width;

        const px = (e.clientX - rect.left) / scale;
        const py = (e.clientY - rect.top) / scale;
        const nearHeaderBottom = headerH > 0 && Math.abs(py - headerH) <= HF_HIT;
        const nearFooterTop = footerH > 0 && Math.abs(py - (pageH - footerH)) <= HF_HIT;

        if (nearHeaderBottom || nearFooterTop) {
            setHoverSide(null); // ไม่ให้ไปชนกับ drag margin
            (wrapRef.current as any).style.cursor = "ns-resize";
            return;
        } else {
            (wrapRef.current as any).style.cursor = "default";
        }

        const side = hitTestSide(px, py, (previewMargin ?? baseMargin), pageW, pageH, headerH, footerH);

        // ถ้า preset locked และ source=preset => hover ได้แต่จะลากไม่ได้ (เพื่อให้รู้ว่ามีเส้น)
        setHoverSide(side);
    }

    function onPointerLeave() {
        if (dragRef.current || hfDragRef.current) return;
        setHoverSide(null);
        setLimitSide(null);
        (wrapRef.current as any).style.cursor = "default";
    }


    function onPointerDown(e: React.PointerEvent) {
        if (thumbPreview) return;
        if (e.target !== e.currentTarget) return;

        const el = wrapRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const scale = rect.width / preset.size.width;
        const py = (e.clientY - rect.top) / scale;

        const nearHeaderBottom = headerH > 0 && Math.abs(py - headerH) <= HF_HIT;
        const nearFooterTop = footerH > 0 && Math.abs(py - (pageH - footerH)) <= HF_HIT;

        // ✅ 1) handle header/footer resize ก่อน

        if (nearHeaderBottom || nearFooterTop) {
            (el as any).setPointerCapture?.(e.pointerId);
            hfDragRef.current = {
                presetId: preset.id,
                kind: nearHeaderBottom ? "header" : "footer",
                startClientY: e.clientY,
                startHeaderH: headerH,
                startFooterH: footerH,
                scale,
                pageH,
                pointerId: e.pointerId
            };

            const kind = nearHeaderBottom ? "header" : "footer";
            setEditingTarget(kind);
            setSelectedNodeIds([]);
            e.preventDefault();
            return;
        }

        // ✅ 2) ค่อยไป handle margin drag
        if (!hoverSide) return;

        const source = (page.marginSource ?? "preset") as "preset" | "page";
        if (source === "preset" && preset.locked) return;
        (el as any).setPointerCapture?.(e.pointerId);
        dragRef.current = {
            pageId: page.id,
            presetId: preset.id,
            source,
            side: hoverSide,
            startClientX: e.clientX,
            startClientY: e.clientY,
            scale,
            startMargin: baseMargin,
            pageW: preset.size.width,
            bodyH,
            pointerId: e.pointerId
        };

        setDragSide(hoverSide);
        setPreviewMargin(baseMargin);
        e.preventDefault();
    }

    useEffect(() => {
        function onMove(ev: PointerEvent) {
            // ✅ 1) header/footer resize first
            const ctxHF = hfDragRef.current;
            if (ctxHF) {
                const dyClient = ev.clientY - ctxHF.startClientY;
                const dy = dyClient / (ctxHF.scale || 1);

                if (ctxHF.kind === "header") {
                    const raw = ctxHF.startHeaderH + dy;
                    const curFooterH = previewFooterHRef.current ?? hfRef.current.footerH;
                    setPreviewHeaderH(clampHeader(raw, curFooterH, ctxHF.pageH));
                } else {
                    const raw = ctxHF.startFooterH - dy;
                    const curHeaderH = previewHeaderHRef.current ?? hfRef.current.headerH;
                    setPreviewFooterH(clampFooter(raw, curHeaderH, ctxHF.pageH));
                }



                return;
            }


            // ✅ 2) margin drag
            const ctx = dragRef.current;
            if (!ctx) return;

            const { dx, dy } = clientToPageDelta(
                ev.clientX - ctx.startClientX,
                ev.clientY - ctx.startClientY,
                ctx.scale
            );
            const shift = ev.shiftKey;

            const result = applyDrag(ctx.side, ctx.startMargin, dx, dy, shift, ctx.pageW, ctx.bodyH);
            setPreviewMargin(result.margin);
            setLimitSide(result.hitLimit ? ctx.side : null);
        }


        function onUp(ev: PointerEvent) {
            const ctxHF = hfDragRef.current;
            if (ctxHF) {
                const dyClient = ev.clientY - ctxHF.startClientY;
                const dy = dyClient / (ctxHF.scale || 1);

                if (ctxHF.kind === "header") {
                    const raw = ctxHF.startHeaderH + dy;
                    const curFooterH = previewFooterHRef.current ?? hfRef.current.footerH;
                    const next = clampHeader(raw, curFooterH, ctxHF.pageH);
                    updateRepeatAreaHeightPx(ctxHF.presetId, "header", roundInt(next));
                } else {
                    const raw = ctxHF.startFooterH - dy;
                    const curHeaderH = previewHeaderHRef.current ?? hfRef.current.headerH;
                    const next = clampFooter(raw, curHeaderH, ctxHF.pageH);
                    updateRepeatAreaHeightPx(ctxHF.presetId, "footer", roundInt(next));
                }


                hfDragRef.current = null;
                setPreviewHeaderH(null);
                setPreviewFooterH(null);

                try { wrapRef.current?.releasePointerCapture?.(ctxHF.pointerId); } catch { }

                return;
            }


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
                try { wrapRef.current?.releasePointerCapture?.(ctx.pointerId); } catch { }


            } else {
                updatePageMargin(ctx.pageId, patch);
                try { wrapRef.current?.releasePointerCapture?.(ctx.pointerId); } catch { }

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
    }, [previewMargin, updatePageMargin, updatePresetMargin, updateRepeatAreaHeightPx, setEditingTarget, setSelectedNodeIds]);


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

    const headerNodes = useMemo(() => {
        if (!renderNodes || headerH <= 0) return [];
        const { nodesById, nodeOrder } = getNodesByTarget(page.id, "header");
        return (nodeOrder ?? []).map(id => nodesById[id]).filter(Boolean).filter(n => (n as any).visible !== false);
    }, [renderNodes, headerH, page.id, getNodesByTarget]);

    const footerNodes = useMemo(() => {
        if (!renderNodes || footerH <= 0) return [];
        const { nodesById, nodeOrder } = getNodesByTarget(page.id, "footer");
        return (nodeOrder ?? []).map(id => nodesById[id]).filter(Boolean).filter(n => (n as any).visible !== false);
    }, [renderNodes, footerH, page.id, getNodesByTarget]);

    const isHeaderMode = editingTarget === "header";
    const isFooterMode = editingTarget === "footer";
    const isPageMode = editingTarget === "page";

    const showZones = true;

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
            onDoubleClick={(e) => {
                if (thumbPreview) return;

                const el = wrapRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const scale = rect.width / pageW;

                const py = (e.clientY - rect.top) / scale;

                if (headerH > 0 && py >= 0 && py <= headerH) {
                    setEditingTarget("header");
                    return;
                }
                if (footerH > 0 && py >= pageH - footerH && py <= pageH) {
                    setEditingTarget("footer");
                    return;
                }
                setEditingTarget("page");
            }}
            onPointerDownCapture={(e) => {
                if (thumbPreview) return;
                if (editingTarget === "page") return;

                const el = wrapRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const scale = rect.width / pageW;

                const py = (e.clientY - rect.top) / scale;

                const inHeader = headerH > 0 && py >= 0 && py <= headerH;
                const inFooter = footerH > 0 && py >= pageH - footerH && py <= pageH;

                if (editingTarget === "header" && !inHeader) setEditingTarget("page");
                if (editingTarget === "footer" && !inFooter) setEditingTarget("page");
            }}

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
                                    top: headerH + margin.top,
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
                                    top: preset.size.height - footerH - margin.bottom,
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
            {showZones && (
                <>
                    {/* ===== Header zone ===== */}
                    {headerH > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                width: pageW,
                                height: headerH,

                                // จางมาก ไม่รบกวนสายตา
                                background: "rgba(0,0,0,0.015)",

                                // เน้นที่เส้น
                                borderBottom: `1px solid ${isHeaderMode ? "rgba(59,130,246,0.65)" : "rgba(0,0,0,0.12)"
                                    }`,

                                pointerEvents: "none",
                                zIndex: 2,
                            }}
                        />
                    )}

                    {/* ===== Footer zone ===== */}
                    {footerH > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: 0,
                                top: pageH - footerH,
                                width: pageW,
                                height: footerH,

                                background: "rgba(0,0,0,0.015)",

                                borderTop: `1px solid ${isFooterMode ? "rgba(59,130,246,0.65)" : "rgba(0,0,0,0.12)"
                                    }`,

                                pointerEvents: "none",
                                zIndex: 2,
                            }}
                        />
                    )}

                    {/* ===== Header label (เฉพาะตอนเข้าโหมด) ===== */}
                    {isHeaderMode && headerH > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: 12,
                                top: 8,
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: "rgba(59,130,246,0.85)",
                                color: "#fff",
                                fontSize: 12,
                                pointerEvents: "none",
                                zIndex: 5,
                            }}
                        >
                            Header
                        </div>
                    )}

                    {/* ===== Footer label (เฉพาะตอนเข้าโหมด) ===== */}
                    {isFooterMode && footerH > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: 12,
                                top: pageH - footerH + 8,
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: "rgba(59,130,246,0.85)",
                                color: "#fff",
                                fontSize: 12,
                                pointerEvents: "none",
                                zIndex: 5,
                            }}
                        >
                            Footer
                        </div>
                    )}
                </>
            )}
            {renderNodes && (
                <>
                    {/* Header nodes */}
                    {headerNodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} offsetX={0} offsetY={0} />
                    ))}

                    {/* Page (body) nodes */}
                    {nodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} offsetX={0} offsetY={headerH} />
                    ))}

                    {/* Footer nodes */}
                    {footerNodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} offsetX={0} offsetY={pageH - footerH} />
                    ))}
                </>
            )}


        </div>
    );
}
