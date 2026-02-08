"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentJson, PageJson, PagePreset } from "../../editor-core/schema";
import { NodeView } from "./NodeView";
import * as Sel from "../../editor-core/schema/selectors";
import { computePageRects } from "../../editor-core/geometry/pageMetrics";
import * as Cmd from "../../editor-core/commands/docCommands";
import { useEditorStore } from "../store/editorStore"; // ✅ เพิ่ม
import { clientToPageDelta, clientToPagePoint } from "../utils/coords";

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
    zoom = 1,
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
    zoom?: number;
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
        startPageY: number;
        startHeaderH: number;
        startFooterH: number;
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
    const headerAnchorToMargins = hf.headerAnchorToMargins;
    const footerAnchorToMargins = hf.footerAnchorToMargins;

    const hfRef = useRef(hf);
    useEffect(() => { hfRef.current = hf; }, [hf]);

    const previewHeaderHRef = useRef<number | null>(null);
    const previewFooterHRef = useRef<number | null>(null);
    useEffect(() => { previewHeaderHRef.current = previewHeaderH; }, [previewHeaderH]);
    useEffect(() => { previewFooterHRef.current = previewFooterH; }, [previewFooterH]);

    const pageW = preset.size.width;
    const pageH = preset.size.height;
    const hfZone = useMemo(() => Sel.getHeaderFooterZone(document, preset.id), [document.headerFooterByPresetId, preset.id]);

    // ===== preview + dragging state =====
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [hoverSide, setHoverSide] = useState<Side | null>(null);
    const [dragSide, setDragSide] = useState<Side | null>(null);
    const [previewMargin, setPreviewMargin] = useState<PagePreset["margin"] | null>(null);
    const [limitSide, setLimitSide] = useState<Side | null>(null);

    // ใช้ margin สำหรับ render (ถ้ากำลังลาก ให้ใช้ preview)
    const margin = previewMargin ?? baseMargin;


    const previewMarginRef = useRef<PagePreset["margin"] | null>(null);
    useEffect(() => { previewMarginRef.current = previewMargin; }, [previewMargin]);

    const pageWRef = useRef(pageW);
    const pageHRef = useRef(pageH);

    useEffect(() => { pageWRef.current = pageW; pageHRef.current = pageH; }, [pageW, pageH]);

    const hfZoneRef = useRef(hfZone);
    useEffect(() => { hfZoneRef.current = hfZone; }, [hfZone]);

    // เก็บฟังก์ชันจาก store ไว้ใน ref กัน identity เปลี่ยนแล้ว effect วิ่ง
    const storeFnsRef = useRef({
        updatePresetMargin,
        updatePageMargin,
        updateRepeatAreaHeightPx,
        setEditingTarget,
        setSelectedNodeIds,
    });
    useEffect(() => {
        storeFnsRef.current = {
            updatePresetMargin,
            updatePageMargin,
            updateRepeatAreaHeightPx,
            setEditingTarget,
            setSelectedNodeIds,
        };
    }, [updatePresetMargin, updatePageMargin, updateRepeatAreaHeightPx, setEditingTarget, setSelectedNodeIds]);






    // rects/page-lines ใช้ single source of truth (รองรับ preview margin/header/footer)
    const rects = useMemo(() => {
        return computePageRects({
            pageW,
            pageH,
            margin,
            headerH,
            footerH,
            headerAnchorToMargins,
            footerAnchorToMargins,
        });
    }, [pageW, pageH, margin, headerH, footerH, headerAnchorToMargins, footerAnchorToMargins]);

    const content = rects.bodyRect;


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
        startPagePt: { px: number; py: number };
        startMargin: PagePreset["margin"];
        pageW: number;
        pageH: number;
        pointerId: number;
    }>(null);

    function clampHeader(nextHeaderH: number, footerH: number, pageH: number) {
        const z = hfZoneRef.current;
        const m = previewMarginRef.current ?? baseMargin;
        const contentH = Math.max(0, pageH - Math.max(0, m.top) - Math.max(0, m.bottom));
        return Cmd.clampRepeatAreaHeightPx({
            kind: "header",
            desiredPx: nextHeaderH,
            pageH,
            contentH,
            otherPx: footerH,
            areaMinPx: z?.header?.minHeightPx,
            areaMaxPx: z?.header?.maxHeightPx,
        });
    }

    function clampFooter(nextFooterH: number, headerH: number, pageH: number) {
        const z = hfZoneRef.current;
        const m = previewMarginRef.current ?? baseMargin;
        const contentH = Math.max(0, pageH - Math.max(0, m.top) - Math.max(0, m.bottom));
        return Cmd.clampRepeatAreaHeightPx({
            kind: "footer",
            desiredPx: nextFooterH,
            pageH,
            contentH,
            otherPx: headerH,
            areaMinPx: z?.footer?.minHeightPx,
            areaMaxPx: z?.footer?.maxHeightPx,
        });
    }


    // NOTE: client->page conversion is centralized in editor-ui/utils/coords.ts

    function hitTestSide(px: number, py: number, lines: { marginLeftX: number; marginRightX: number; marginTopY: number; marginBottomY: number }): Side | null {

        const xL = lines.marginLeftX;
        const xR = lines.marginRightX;
        const yT = lines.marginTopY;
        const yB = lines.marginBottomY;

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
        if (dragRef.current || hfDragRef.current) return;
        const el = wrapRef.current;
        if (!el) return;

        const pw = pageWRef.current;
        const ph = pageHRef.current;

        const { px, py } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);
        const nearHeaderBottom = headerH > 0 && Math.abs(py - rects.lines.headerBottomY) <= HF_HIT;
        const nearFooterTop = footerH > 0 && Math.abs(py - rects.lines.footerTopY) <= HF_HIT;

        if (nearHeaderBottom || nearFooterTop) {
            setHoverSide(null); // ไม่ให้ไปชนกับ drag margin
            (wrapRef.current as any).style.cursor = "ns-resize";
            return;
        } else {
            (wrapRef.current as any).style.cursor = "default";
        }

        const side = hitTestSide(px, py, rects.lines);

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

        const pw = pageWRef.current;
        const ph = pageHRef.current;

        const { py } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);

        const nearHeaderBottom = headerH > 0 && Math.abs(py - rects.lines.headerBottomY) <= HF_HIT;
        const nearFooterTop = footerH > 0 && Math.abs(py - rects.lines.footerTopY) <= HF_HIT;

        // ✅ 1) handle header/footer resize ก่อน

        if (nearHeaderBottom || nearFooterTop) {
            (el as any).setPointerCapture?.(e.pointerId);
            const pt = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);
            hfDragRef.current = {
                presetId: preset.id,
                kind: nearHeaderBottom ? "header" : "footer",
                startPageY: pt.py,
                startHeaderH: headerH,
                startFooterH: footerH,
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
            startPagePt: (() => {
                const pt = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);
                return { px: pt.px, py: pt.py };
            })(),
            startMargin: baseMargin,
            pageW: preset.size.width,
            pageH,
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
                const el = wrapRef.current;
                if (!el) return;

                const pw = pageWRef.current;
                const ph = pageHRef.current;

                const cur = clientToPagePoint(el, ev.clientX, ev.clientY, pw, ph);
                const dy = cur.py - ctxHF.startPageY;

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

            const el = wrapRef.current;
            if (!el) return;

            const pw = pageWRef.current;
            const ph = pageHRef.current;

            const cur = clientToPagePoint(el, ev.clientX, ev.clientY, pw, ph);
            const { dx, dy } = clientToPageDelta(ctx.startPagePt, cur);
            const shift = ev.shiftKey;

            const result = applyDrag(ctx.side, ctx.startMargin, dx, dy, shift, ctx.pageW, ctx.pageH);
            setPreviewMargin(result.margin);
            setLimitSide(result.hitLimit ? ctx.side : null);
        }

        function onUp(ev: PointerEvent) {
            const el = wrapRef.current;

            // header/footer commit
            const ctxHF = hfDragRef.current;
            if (ctxHF) {
                if (!el) return;

                const pw = pageWRef.current;
                const ph = pageHRef.current;

                const cur = clientToPagePoint(el, ev.clientX, ev.clientY, pw, ph);
                const dy = cur.py - ctxHF.startPageY;

                const fns = storeFnsRef.current;

                if (ctxHF.kind === "header") {
                    const raw = ctxHF.startHeaderH + dy;
                    const curFooterH = previewFooterHRef.current ?? hfRef.current.footerH;
                    const next = clampHeader(raw, curFooterH, ctxHF.pageH);
                    fns.updateRepeatAreaHeightPx(ctxHF.presetId, "header", roundInt(next));
                } else {
                    const raw = ctxHF.startFooterH - dy;
                    const curHeaderH = previewHeaderHRef.current ?? hfRef.current.headerH;
                    const next = clampFooter(raw, curHeaderH, ctxHF.pageH);
                    fns.updateRepeatAreaHeightPx(ctxHF.presetId, "footer", roundInt(next));
                }

                hfDragRef.current = null;
                setPreviewHeaderH(null);
                setPreviewFooterH(null);

                try { el.releasePointerCapture?.(ctxHF.pointerId); } catch { }
                return;
            }

            // margin commit
            const ctx = dragRef.current;
            if (!ctx) return;

            const fns = storeFnsRef.current;

            const final = previewMarginRef.current ?? ctx.startMargin;

            const patch: Partial<PagePreset["margin"]> = {
                top: roundInt(final.top),
                right: roundInt(final.right),
                bottom: roundInt(final.bottom),
                left: roundInt(final.left),
            };

            if (ctx.source === "preset") {
                fns.updatePresetMargin(ctx.presetId, patch);
            } else {
                fns.updatePageMargin(ctx.pageId, patch);
            }

            try { el?.releasePointerCapture?.(ctx.pointerId); } catch { }

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
    }, []);

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
    // Render "hairline" strokes (≈1 device pixel) even when the whole page is scaled.
    // PageSlot provides CSS var --zoom.
    const hairline = `calc(1px / ${zoom || 1})`;

    const snapDocY = (yDoc: number) => {
        const z = zoom || 1;
        return Math.round(yDoc * z) / z;
    };

    const headerLineY = headerH > 0 ? snapDocY(rects.lines.headerBottomY) : null;
    const footerLineY = footerH > 0 ? snapDocY(rects.lines.footerTopY) : null;


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
                const pw = pageWRef.current;
                const ph = pageHRef.current;
                const { py } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);

                if (headerH > 0 && py >= rects.headerRect.y && py <= (rects.headerRect.y + headerH)) {
                    setEditingTarget("header");
                    return;
                }
                if (footerH > 0 && py >= rects.footerRect.y && py <= (rects.footerRect.y + footerH)) {
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
                const pw = pageWRef.current;
                const ph = pageHRef.current;
                const { py } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);

                const inHeader = headerH > 0 && py >= rects.headerRect.y && py <= (rects.headerRect.y + headerH);
                const inFooter = footerH > 0 && py >= rects.footerRect.y && py <= (rects.footerRect.y + footerH);

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
                            border: `${hairline} dashed #9ca3af`,
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
                                    height: hairline,
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
                                    height: hairline,
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
                                    width: hairline,
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
                                    width: hairline,
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
                                left: rects.contentRect.x,
                                top: rects.headerRect.y,
                                width: rects.contentRect.w,
                                height: headerH,
                                pointerEvents: "none",
                                zIndex: 2,
                            }}
                        />
                    )}
                    {headerLineY != null && (
                        <div style={{
                            position: "absolute",
                            left: rects.contentRect.x,
                            top: headerLineY,
                            width: rects.contentRect.w,
                            height: hairline,
                            background: isHeaderMode ? "rgba(59,130,246,0.65)" : "rgba(0,0,0,0.12)",
                            pointerEvents: "none",
                            zIndex: 3,
                        }} />
                    )}
                    {/* ===== Footer zone ===== */}
                    {footerH > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: rects.contentRect.x,
                                top: rects.footerRect.y,
                                width: rects.contentRect.w,
                                height: footerH,
                                pointerEvents: "none",
                                zIndex: 2,
                            }}
                        />
                    )}
                    {footerLineY != null && (
                        <div
                            style={{
                                position: "absolute",
                                left: rects.contentRect.x,
                                top: footerLineY,
                                width: rects.contentRect.w,
                                height: hairline,
                                background: isFooterMode ? "rgba(59,130,246,0.65)" : "rgba(0,0,0,0.12)",
                                pointerEvents: "none",
                                zIndex: 3,
                            }}
                        />
                    )}



                    {/* ===== Header label (เฉพาะตอนเข้าโหมด) ===== */}
                    {isHeaderMode && headerH > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: rects.contentRect.x + 12,
                                top: rects.headerRect.y + 8,
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
                                left: rects.contentRect.x + 12,
                                top: rects.footerRect.y + 8,
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
                        <NodeView key={n.id} doc={document} node={n} offsetX={rects.contentRect.x} offsetY={rects.headerRect.y} />
                    ))}

                    {/* Page (body) nodes */}
                    {nodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} offsetX={rects.contentRect.x} offsetY={rects.bodyRect.y} />
                    ))}

                    {/* Footer nodes */}
                    {footerNodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} offsetX={rects.contentRect.x} offsetY={rects.footerRect.y} />
                    ))}
                </>
            )}


        </div>
    );
}
