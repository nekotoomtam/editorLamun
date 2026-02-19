"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId, type DocumentJson, type PageJson, type PagePreset } from "../../editor-core/schema";
import { NodeView } from "./NodeView";
import * as Sel from "../../editor-core/schema/selectors";
import { computePageRects } from "../../editor-core/geometry/pageMetrics";
import * as Cmd from "../../editor-core/commands/docCommands";
import { pt100ToPx } from "../utils/units";
import { useEditorStore } from "../store/editorStore"; // ✅ เพิ่ม
import { clientToPageDelta, clientToPagePoint } from "../utils/coords";

type Side = "top" | "right" | "bottom" | "left";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}
function roundInt(n: number) {
    return Math.round(n);
}

const BOX_DEFAULT_W_PT100 = 12000;
const BOX_DEFAULT_H_PT100 = 8000;

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
        addNode,
        updateNode,
        session,
        setEditingTarget,
        getNodesByTarget,
        setSelectedNodeIds,
        setTool,
        setDrag,
        updateRepeatAreaHeightPt,   // ✅ เพิ่ม
    } = useEditorStore();

    const editingTarget = session.editingTarget ?? "page";
    const HF_HIT = 600;

    const hfDragRef = useRef<null | {
        presetId: string;
        kind: "header" | "footer";
        startPageY: number;
        startHeaderH: number;
        startFooterH: number;
        pageHPt: number;
        pointerId: number;

    }>(null);

    const [previewHeaderH, setPreviewHeaderH] = useState<number | null>(null);
    const [previewFooterH, setPreviewFooterH] = useState<number | null>(null);
    const [ghostBoxPt100, setGhostBoxPt100] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

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
    const headerHPt = previewHeaderH ?? hf.headerH;
    const footerHPt = previewFooterH ?? hf.footerH;
    const headerAnchorToMargins = hf.headerAnchorToMargins;
    const footerAnchorToMargins = hf.footerAnchorToMargins;

    const hfRef = useRef(hf);
    useEffect(() => { hfRef.current = hf; }, [hf]);

    const previewHeaderHRef = useRef<number | null>(null);
    const previewFooterHRef = useRef<number | null>(null);
    useEffect(() => { previewHeaderHRef.current = previewHeaderH; }, [previewHeaderH]);
    useEffect(() => { previewFooterHRef.current = previewFooterH; }, [previewFooterH]);

    const pageWPt = preset.size.width;
    const pageHPt = preset.size.height;
    const pageWPx = pt100ToPx(pageWPt);
    const pageHPx = pt100ToPx(pageHPt);
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
    const sessionDragRef = useRef(session.drag ?? null);
    useEffect(() => { sessionDragRef.current = session.drag ?? null; }, [session.drag]);
    const docRef = useRef(document);
    useEffect(() => { docRef.current = document; }, [document]);

    const pageWPtRef = useRef(pageWPt);
    const pageHPtRef = useRef(pageHPt);

    useEffect(() => { pageWPtRef.current = pageWPt; pageHPtRef.current = pageHPt; }, [pageWPt, pageHPt]);

    const hfZoneRef = useRef(hfZone);
    useEffect(() => { hfZoneRef.current = hfZone; }, [hfZone]);

    // เก็บฟังก์ชันจาก store ไว้ใน ref กัน identity เปลี่ยนแล้ว effect วิ่ง
    const storeFnsRef = useRef({
        updatePresetMargin,
        updatePageMargin,
        updateRepeatAreaHeightPt,
        updateNode,
        setDrag,
        setEditingTarget,
        setSelectedNodeIds,
    });
    useEffect(() => {
        storeFnsRef.current = {
            updatePresetMargin,
            updatePageMargin,
            updateRepeatAreaHeightPt,
            updateNode,
            setDrag,
            setEditingTarget,
            setSelectedNodeIds,
        };
    }, [updatePresetMargin, updatePageMargin, updateRepeatAreaHeightPt, updateNode, setDrag, setEditingTarget, setSelectedNodeIds]);






    // rects/page-lines ใช้ single source of truth (รองรับ preview margin/header/footer)
    const pageRectsPt = useMemo(() => {
        return computePageRects({
            pageWPt,
            pageHPt,
            margin,
            headerHPt,
            footerHPt,
            headerAnchorToMargins,
            footerAnchorToMargins,
        });
    }, [pageWPt, pageHPt, margin, headerHPt, footerHPt, headerAnchorToMargins, footerAnchorToMargins]);
    const pageRectsRef = useRef(pageRectsPt);
    useEffect(() => { pageRectsRef.current = pageRectsPt; }, [pageRectsPt]);

    const marginPx = {
        top: pt100ToPx(margin.top),
        right: pt100ToPx(margin.right),
        bottom: pt100ToPx(margin.bottom),
        left: pt100ToPx(margin.left),
    };
    const contentRectPx = {
        x: pt100ToPx(pageRectsPt.contentRectPt.x),
        y: pt100ToPx(pageRectsPt.contentRectPt.y),
        w: pt100ToPx(pageRectsPt.contentRectPt.w),
        h: pt100ToPx(pageRectsPt.contentRectPt.h),
    };
    const headerRectPx = {
        x: pt100ToPx(pageRectsPt.headerRectPt.x),
        y: pt100ToPx(pageRectsPt.headerRectPt.y),
        w: pt100ToPx(pageRectsPt.headerRectPt.w),
        h: pt100ToPx(pageRectsPt.headerRectPt.h),
    };
    const footerRectPx = {
        x: pt100ToPx(pageRectsPt.footerRectPt.x),
        y: pt100ToPx(pageRectsPt.footerRectPt.y),
        w: pt100ToPx(pageRectsPt.footerRectPt.w),
        h: pt100ToPx(pageRectsPt.footerRectPt.h),
    };
    const headerHPx = pt100ToPx(headerHPt);
    const footerHPx = pt100ToPx(footerHPt);


    // ===== drag math config =====
    const HIT = 600; // ระยะจับใกล้เส้น (Pt100 ใน page space)
    const MIN_CONTENT_W = 4000;
    const MIN_CONTENT_H = 4000;

    // drag context (เก็บไว้ใน ref เพื่อไม่ rerender ทุก move)
    const dragRef = useRef<null | {
        pageId: string;
        presetId: string;
        source: "preset" | "page";
        side: Side;
        startPagePt: { xPt: number; yPt: number };
        startMargin: PagePreset["margin"];
        pageWPt: number;
        pageHPt: number;
        pointerId: number;
    }>(null);

    function clampHeader(nextHeaderH: number, footerHPt: number, pageHPt: number) {
        const z = hfZoneRef.current;
        const m = previewMarginRef.current ?? baseMargin;
        const contentH = Math.max(0, pageHPt - Math.max(0, m.top) - Math.max(0, m.bottom));
        return Cmd.clampRepeatAreaHeightPt({
            kind: "header",
            desiredPt: nextHeaderH,
            pageH: pageHPt,
            contentH,
            otherPt: footerHPt,
            areaMinPt: z?.header?.minHeightPt,
            areaMaxPt: z?.header?.maxHeightPt,
        });
    }

    function clampFooter(nextFooterH: number, headerHPt: number, pageHPt: number) {
        const z = hfZoneRef.current;
        const m = previewMarginRef.current ?? baseMargin;
        const contentH = Math.max(0, pageHPt - Math.max(0, m.top) - Math.max(0, m.bottom));
        return Cmd.clampRepeatAreaHeightPt({
            kind: "footer",
            desiredPt: nextFooterH,
            pageH: pageHPt,
            contentH,
            otherPt: headerHPt,
            areaMinPt: z?.footer?.minHeightPt,
            areaMaxPt: z?.footer?.maxHeightPt,
        });
    }


    // NOTE: client->page conversion is centralized in editor-ui/utils/coords.ts

    function hitTestSide(xPt: number, yPt: number, lines: { marginLeftX: number; marginRightX: number; marginTopY: number; marginBottomY: number }): Side | null {

        const xL = lines.marginLeftX;
        const xR = lines.marginRightX;
        const yT = lines.marginTopY;
        const yB = lines.marginBottomY;

        // ใกล้เส้นไหน + อยู่ในช่วงระนาบนั้น
        // (เราให้จับได้ทั้งแนวของเส้น ไม่ต้องอยู่แค่ใน content)
        if (Math.abs(yPt - yT) <= HIT) return "top";
        if (Math.abs(yPt - yB) <= HIT) return "bottom";
        if (Math.abs(xPt - xL) <= HIT) return "left";
        if (Math.abs(xPt - xR) <= HIT) return "right";

        return null;
    }

    function applyDrag(
        side: Side,
        start: PagePreset["margin"],
        dx: number,
        dy: number,
        shift: boolean,
        pageWPt: number,
        pageHPt: number
    )
        : { margin: PagePreset["margin"]; hitLimit: boolean } {
        let next = { ...start };
        let hitLimit = false;

        const clampLeft = (v: number, rightFixed: number) => {
            const max = pageWPt - rightFixed - MIN_CONTENT_W;
            const c = clamp(v, 0, max);
            if (c !== v) hitLimit = true;
            return c;
        };

        const clampRight = (v: number, leftFixed: number) => {
            const max = pageWPt - leftFixed - MIN_CONTENT_W;
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
            const maxPos = (pageWPt - MIN_CONTENT_W - (start.left + start.right)) / 2;
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
                const max = pageHPt - bottomFixed - MIN_CONTENT_H;
                const c = clamp(v, 0, max);
                if (c !== v) hitLimit = true;
                return c;
            };
            const clampBottom = (v: number, topFixed: number) => {
                const max = pageHPt - topFixed - MIN_CONTENT_H;
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
            const maxPos = (pageHPt - MIN_CONTENT_H - (start.top + start.bottom)) / 2;
            const maxNeg = Math.max(-start.top, -start.bottom);
            const d = clamp(wanted, maxNeg, maxPos);
            if (d !== wanted) hitLimit = true;

            next.top = start.top + d;
            next.bottom = start.bottom + d;
            return { margin: next, hitLimit };
        }
    }

    function computeBoxPlacementPt100(clientX: number, clientY: number) {
        const el = wrapRef.current;
        if (!el) return null;

        const pw = pageWPtRef.current;
        const ph = pageHPtRef.current;
        const { xPt, yPt } = clientToPagePoint(el, clientX, clientY, pw, ph);
        const bodyRect = pageRectsPt.bodyRectPt;

        const localX = xPt - bodyOrigin.x - BOX_DEFAULT_W_PT100 / 2;
        const localY = yPt - bodyOrigin.y - BOX_DEFAULT_H_PT100 / 2;

        const maxX = Math.max(0, bodyRect.w - BOX_DEFAULT_W_PT100);
        const maxY = Math.max(0, bodyRect.h - BOX_DEFAULT_H_PT100);

        return {
            x: roundInt(clamp(localX, 0, maxX)),
            y: roundInt(clamp(localY, 0, maxY)),
            w: BOX_DEFAULT_W_PT100,
            h: BOX_DEFAULT_H_PT100,
        };
    }

    useEffect(() => {
        if (session.tool !== "box") {
            setGhostBoxPt100(null);
        }
    }, [session.tool]);

    const isPlacementActive = session.tool === "box";
    const cancelPlacement = useCallback(() => {
        if (!isPlacementActive) return;
        setGhostBoxPt100(null);
        setTool("select");
    }, [isPlacementActive, setTool]);

    useEffect(() => {
        function onWindowKeyDown(ev: KeyboardEvent) {
            if (ev.key !== "Escape") return;
            if (!isPlacementActive) return;
            ev.preventDefault();
            cancelPlacement();
        }

        window.addEventListener("keydown", onWindowKeyDown);
        return () => {
            window.removeEventListener("keydown", onWindowKeyDown);
        };
    }, [isPlacementActive, cancelPlacement]);


    // ===== pointer handlers =====
    function onPointerMoveLocal(e: React.PointerEvent) {
        if (dragRef.current || hfDragRef.current) return;
        const el = wrapRef.current;
        if (!el) return;

        if (session.tool === "box") {
            const placement = computeBoxPlacementPt100(e.clientX, e.clientY);
            setGhostBoxPt100(placement);
            setHoverSide(null);
            setLimitSide(null);
            (wrapRef.current as any).style.cursor = "crosshair";
            return;
        }

        const pw = pageWPtRef.current;
        const ph = pageHPtRef.current;

        const { xPt, yPt } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);
        const nearHeaderBottom = headerHPt > 0 && Math.abs(yPt - pageRectsPt.lines.headerBottomY) <= HF_HIT;
        const nearFooterTop = footerHPt > 0 && Math.abs(yPt - pageRectsPt.lines.footerTopY) <= HF_HIT;

        if (nearHeaderBottom || nearFooterTop) {
            setHoverSide(null); // ไม่ให้ไปชนกับ drag margin
            (wrapRef.current as any).style.cursor = "ns-resize";
            return;
        } else {
            (wrapRef.current as any).style.cursor = "default";
        }

        const side = hitTestSide(xPt, yPt, pageRectsPt.lines);

        // ถ้า preset locked และ source=preset => hover ได้แต่จะลากไม่ได้ (เพื่อให้รู้ว่ามีเส้น)
        setHoverSide(side);
    }

    function onPointerLeave() {
        if (dragRef.current || hfDragRef.current) return;
        setHoverSide(null);
        setLimitSide(null);
        setGhostBoxPt100(null);
        (wrapRef.current as any).style.cursor = "default";
    }


    function onPointerDown(e: React.PointerEvent) {
        if (thumbPreview) return;
        if (e.target !== e.currentTarget) return;

        const el = wrapRef.current;
        if (!el) return;

        const pw = pageWPtRef.current;
        const ph = pageHPtRef.current;
        const { yPt } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);

        if (session.tool === "box") {
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                cancelPlacement();
                return;
            }
            if (e.button !== 0) return;
            const placement = computeBoxPlacementPt100(e.clientX, e.clientY);
            if (!placement) return;
            const nodeId = createId("box");
            addNode(
                page.id,
                {
                    id: nodeId,
                    owner: { kind: "page", pageId: page.id },
                    pageId: page.id,
                    type: "box",
                    name: "Box",
                    x: placement.x,
                    y: placement.y,
                    w: placement.w,
                    h: placement.h,
                    visible: true,
                    locked: false,
                    style: {
                        fill: "transparent",
                        stroke: "#111827",
                        strokeWidth: 100,
                        radius: 0,
                    },
                },
                "page"
            );
            setEditingTarget("page");
            setSelectedNodeIds([nodeId]);
            setTool("select");
            setGhostBoxPt100(null);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        setSelectedNodeIds([]);

        const nearHeaderBottom = headerHPt > 0 && Math.abs(yPt - pageRectsPt.lines.headerBottomY) <= HF_HIT;
        const nearFooterTop = footerHPt > 0 && Math.abs(yPt - pageRectsPt.lines.footerTopY) <= HF_HIT;

        // ✅ 1) handle header/footer resize ก่อน

        if (nearHeaderBottom || nearFooterTop) {
            (el as any).setPointerCapture?.(e.pointerId);
            const pt = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);
            hfDragRef.current = {
                presetId: preset.id,
                kind: nearHeaderBottom ? "header" : "footer",
                startPageY: pt.yPt,
                startHeaderH: headerHPt,
                startFooterH: footerHPt,
                pageHPt,
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
                return { xPt: pt.xPt, yPt: pt.yPt };
            })(),
            startMargin: baseMargin,
            pageWPt: preset.size.width,
            pageHPt,
            pointerId: e.pointerId
        };

        setDragSide(hoverSide);
        setPreviewMargin(baseMargin);
        e.preventDefault();
    }
    useEffect(() => {
        console.log("pageW pt:", pageWPt);
        console.log("pageH pt:", pageHPt);
        console.log("pageW px:", pageWPx);
        console.log("pageH px:", pageHPx);
        console.log("contentRectPx:", contentRectPx);
    }, []);

    useEffect(() => {
        function onMove(ev: PointerEvent) {
            // ✅ 1) header/footer resize first

            const ctxHF = hfDragRef.current;
            if (ctxHF) {
                const el = wrapRef.current;
                if (!el) return;

                const pw = pageWPtRef.current;
                const ph = pageHPtRef.current;

                const cur = clientToPagePoint(el, ev.clientX, ev.clientY, pw, ph);
                const dy = cur.yPt - ctxHF.startPageY;

                if (ctxHF.kind === "header") {
                    const raw = ctxHF.startHeaderH + dy;
                    const curFooterHPt = previewFooterHRef.current ?? hfRef.current.footerH;
                    setPreviewHeaderH(clampHeader(raw, curFooterHPt, ctxHF.pageHPt));
                } else {
                    const raw = ctxHF.startFooterH - dy;
                    const curHeaderHPt = previewHeaderHRef.current ?? hfRef.current.headerH;
                    setPreviewFooterH(clampFooter(raw, curHeaderHPt, ctxHF.pageHPt));
                }
                return;
            }

            // ✅ 2) margin drag
            const ctx = dragRef.current;
            if (ctx) {
                const el = wrapRef.current;
                if (!el) return;

                const pw = pageWPtRef.current;
                const ph = pageHPtRef.current;

                const cur = clientToPagePoint(el, ev.clientX, ev.clientY, pw, ph);
                const { dx, dy } = clientToPageDelta(ctx.startPagePt, cur);
                const shift = ev.shiftKey;

                const result = applyDrag(ctx.side, ctx.startMargin, dx, dy, shift, ctx.pageWPt, ctx.pageHPt);
                setPreviewMargin(result.margin);
                setLimitSide(result.hitLimit ? ctx.side : null);
                return;
            }

            // ✅ 3) node drag preview (disabled intentionally)
            const drag = sessionDragRef.current as (NonNullable<typeof session.drag> & { startPagePt?: { xPt: number; yPt: number } }) | null;
            if (!drag) return;
            storeFnsRef.current.setDrag(null);
            return;

        }

        function onUp(ev: PointerEvent) {
            const el = wrapRef.current;

            // header/footer commit
            const ctxHF = hfDragRef.current;
            if (ctxHF) {
                if (!el) return;

                const pw = pageWPtRef.current;
                const ph = pageHPtRef.current;

                const cur = clientToPagePoint(el, ev.clientX, ev.clientY, pw, ph);
                const dy = cur.yPt - ctxHF.startPageY;

                const fns = storeFnsRef.current;

                if (ctxHF.kind === "header") {
                    const raw = ctxHF.startHeaderH + dy;
                    const curFooterHPt = previewFooterHRef.current ?? hfRef.current.footerH;
                    const next = clampHeader(raw, curFooterHPt, ctxHF.pageHPt);
                    fns.updateRepeatAreaHeightPt(ctxHF.presetId, "header", roundInt(next));
                } else {
                    const raw = ctxHF.startFooterH - dy;
                    const curHeaderHPt = previewHeaderHRef.current ?? hfRef.current.headerH;
                    const next = clampFooter(raw, curHeaderHPt, ctxHF.pageHPt);
                    fns.updateRepeatAreaHeightPt(ctxHF.presetId, "footer", roundInt(next));
                }

                hfDragRef.current = null;
                setPreviewHeaderH(null);
                setPreviewFooterH(null);

                try { el.releasePointerCapture?.(ctxHF.pointerId); } catch { }
                return;
            }

            // margin commit
            const ctx = dragRef.current;
            if (ctx) {
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
                return;
            }

            // node drag commit (disabled intentionally)
            const drag = sessionDragRef.current;
            if (!drag) return;
            storeFnsRef.current.setDrag(null);
            return;
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
        if (!renderNodes || headerHPt <= 0) return [];
        const { nodesById, nodeOrder } = getNodesByTarget(page.id, "header");
        return (nodeOrder ?? []).map(id => nodesById[id]).filter(Boolean).filter(n => (n as any).visible !== false);
    }, [renderNodes, headerHPt, page.id, getNodesByTarget]);

    const footerNodes = useMemo(() => {
        if (!renderNodes || footerHPt <= 0) return [];
        const { nodesById, nodeOrder } = getNodesByTarget(page.id, "footer");
        return (nodeOrder ?? []).map(id => nodesById[id]).filter(Boolean).filter(n => (n as any).visible !== false);
    }, [renderNodes, footerHPt, page.id, getNodesByTarget]);

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

    const headerLineY = headerHPt > 0 ? snapDocY(pageRectsPt.lines.headerBottomY) : null;
    const footerLineY = footerHPt > 0 ? snapDocY(pageRectsPt.lines.footerTopY) : null;
    const headerLineYPx = headerLineY != null ? pt100ToPx(headerLineY) : null;
    const footerLineYPx = footerLineY != null ? pt100ToPx(footerLineY) : null;

    const headerOrigin = { x: pageRectsPt.contentRectPt.x, y: pageRectsPt.headerRectPt.y };
    const bodyOrigin = { x: pageRectsPt.contentRectPt.x, y: pageRectsPt.bodyRectPt.y };
    const footerOrigin = { x: pageRectsPt.contentRectPt.x, y: pageRectsPt.footerRectPt.y };


    return (
        <div
            ref={(el) => {
                wrapRef.current = el;
                registerRef?.(el);
            }}
            style={{
                position: "relative",
                width: pageWPx,
                height: pageHPx,
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
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isPlacementActive) {
                    cancelPlacement();
                }
            }}
            onDoubleClick={(e) => {
                if (thumbPreview) return;

                const el = wrapRef.current;
                if (!el) return;
                const pw = pageWPtRef.current;
                const ph = pageHPtRef.current;
                const { yPt } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);

                if (headerHPt > 0 && yPt >= pageRectsPt.headerRectPt.y && yPt <= (pageRectsPt.headerRectPt.y + headerHPt)) {
                    setEditingTarget("header");
                    return;
                }
                if (footerHPt > 0 && yPt >= pageRectsPt.footerRectPt.y && yPt <= (pageRectsPt.footerRectPt.y + footerHPt)) {
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
                const pw = pageWPtRef.current;
                const ph = pageHPtRef.current;
                const { yPt } = clientToPagePoint(el, e.clientX, e.clientY, pw, ph);

                const inHeader = headerHPt > 0 && yPt >= pageRectsPt.headerRectPt.y && yPt <= (pageRectsPt.headerRectPt.y + headerHPt);
                const inFooter = footerHPt > 0 && yPt >= pageRectsPt.footerRectPt.y && yPt <= (pageRectsPt.footerRectPt.y + footerHPt);

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
                            left: contentRectPx.x,
                            top: contentRectPx.y,
                            width: contentRectPx.w,
                            height: contentRectPx.h,
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
                                    top: pt100ToPx(headerHPt + margin.top),
                                    width: pageWPx,
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
                                    top: pt100ToPx(pageHPt - footerHPt - margin.bottom),
                                    width: pageWPx,
                                    height: hairline,
                                    ...lineStyle(highlightSide === "bottom", limitSide === "bottom"),
                                    pointerEvents: "none",
                                }}
                            />
                            {/* left line */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: marginPx.left,
                                    top: 0,
                                    width: hairline,
                                    height: pageHPx,
                                    ...lineStyle(highlightSide === "left", limitSide === "left"),
                                    pointerEvents: "none",
                                }}
                            />
                            {/* right line */}
                            <div
                                style={{
                                    position: "absolute",
                                    left: pt100ToPx(pageWPt - margin.right),
                                    top: 0,
                                    width: hairline,
                                    height: pageHPx,
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
                    {headerHPt > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: contentRectPx.x,
                                top: headerRectPx.y,
                                width: contentRectPx.w,
                                height: headerHPx,
                                pointerEvents: "none",
                                zIndex: 2,
                            }}
                        />
                    )}
                    {headerLineYPx != null && (
                        <div style={{
                            position: "absolute",
                            left: contentRectPx.x,
                            top: headerLineYPx,
                            width: contentRectPx.w,
                            height: hairline,
                            background: isHeaderMode ? "rgba(59,130,246,0.65)" : "rgba(0,0,0,0.12)",
                            pointerEvents: "none",
                            zIndex: 3,
                        }} />
                    )}
                    {/* ===== Footer zone ===== */}
                    {footerHPt > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: contentRectPx.x,
                                top: footerRectPx.y,
                                width: contentRectPx.w,
                                height: footerHPx,
                                pointerEvents: "none",
                                zIndex: 2,
                            }}
                        />
                    )}
                    {footerLineYPx != null && (
                        <div
                            style={{
                                position: "absolute",
                                left: contentRectPx.x,
                                top: footerLineYPx,
                                width: contentRectPx.w,
                                height: hairline,
                                background: isFooterMode ? "rgba(59,130,246,0.65)" : "rgba(0,0,0,0.12)",
                                pointerEvents: "none",
                                zIndex: 3,
                            }}
                        />
                    )}



                    {/* ===== Header label (เฉพาะตอนเข้าโหมด) ===== */}
                    {isHeaderMode && headerHPt > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: contentRectPx.x + 12,
                                top: headerRectPx.y + 8,
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
                    {isFooterMode && footerHPt > 0 && (
                        <div
                            style={{
                                position: "absolute",
                                left: contentRectPx.x + 12,
                                top: footerRectPx.y + 8,
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
                        <NodeView key={n.id} doc={document} node={n} zoneOriginX={headerOrigin.x} zoneOriginY={headerOrigin.y} pageWPt={pageWPt} pageHPt={pageHPt} />
                    ))}

                    {/* Page (body) nodes */}
                    {nodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} zoneOriginX={bodyOrigin.x} zoneOriginY={bodyOrigin.y} pageWPt={pageWPt} pageHPt={pageHPt} />
                    ))}

                    {/* Footer nodes */}
                    {footerNodes.map((n) => (
                        <NodeView key={n.id} doc={document} node={n} zoneOriginX={footerOrigin.x} zoneOriginY={footerOrigin.y} pageWPt={pageWPt} pageHPt={pageHPt} />
                    ))}
                </>
            )}
            {ghostBoxPt100 && session.tool === "box" && (
                <div
                    style={{
                        position: "absolute",
                        left: pt100ToPx(bodyOrigin.x + ghostBoxPt100.x),
                        top: pt100ToPx(bodyOrigin.y + ghostBoxPt100.y),
                        width: pt100ToPx(ghostBoxPt100.w),
                        height: pt100ToPx(ghostBoxPt100.h),
                        border: "1px dashed rgba(17,24,39,0.65)",
                        background: "rgba(59,130,246,0.12)",
                        pointerEvents: "none",
                        zIndex: 9,
                    }}
                />
            )}


        </div>
    );
}
