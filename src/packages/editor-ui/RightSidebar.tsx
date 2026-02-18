"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrientation, pt100ToPt, ptToPt100, type DocumentJson, type Id, type NodeJson } from "../editor-core/schema";
import { useEditorSessionStore, useEditorStore } from "./store/editorStore";
import CollapsibleSection from "./CollapsibleSection";
import * as Sel from "../editor-core/schema/selectors";
import * as Cmd from "../editor-core/commands/docCommands";

type SelectionType = "none" | "page" | "element";

type SelectionContext = {
    selectionType: SelectionType;
    currentPageId: Id | null;
    currentElementId: Id | null;
};

function getNodePageId(node: NodeJson, doc: DocumentJson, activePageId: Id | null): Id | null {
    if (node.owner.kind === "page") return node.owner.pageId;

    const targetPresetId = node.owner.presetId;
    if (activePageId) {
        const active = doc.pagesById[activePageId];
        if (active?.presetId === targetPresetId) return activePageId;
    }

    for (const pageId of doc.pageOrder) {
        const page = doc.pagesById[pageId];
        if (page?.presetId === targetPresetId) return pageId;
    }

    return null;
}

function readSelectionContext(doc: DocumentJson, activePageId: Id | null, selectedNodeIds: Id[]): SelectionContext {
    const currentElementId =
        [...selectedNodeIds].reverse().find((id) => Boolean(doc.nodesById[id])) ?? null;

    if (currentElementId) {
        const node = doc.nodesById[currentElementId];
        const pageId = getNodePageId(node, doc, activePageId);
        return {
            selectionType: "element",
            currentPageId: pageId ?? activePageId,
            currentElementId,
        };
    }

    if (activePageId && doc.pagesById[activePageId]) {
        return {
            selectionType: "page",
            currentPageId: activePageId,
            currentElementId: null,
        };
    }

    return {
        selectionType: "none",
        currentPageId: null,
        currentElementId: null,
    };
}

type CardOpenState = Record<string, boolean>;

const DEFAULT_OPEN: CardOpenState = {
    addContent: true,
    addLayout: false,
    pagePaper: true,
    pageMargins: true,
    pageHeaderFooter: false,
    pageInfo: false,
    elementLayout: true,
    elementStyle: false,
    elementData: false,
    elementAdvanced: false,
};

const EMPTY_IDS: Id[] = [];
const MIN_BODY_PT100_FALLBACK = 12000;
const MAX_MARGIN_PT = 5000;

type MarginPt = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

function clampPt(n: number, min = 0, max = MAX_MARGIN_PT) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function fmtPt(v: number) {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function clampMarginForBodyHeight(args: {
    raw: MarginPt;
    linked: boolean;
    pageH: number;
    headerH: number;
    footerH: number;
    minBody: number;
}): MarginPt {
    const rawTop = Math.max(0, ptToPt100(args.raw.top));
    const rawRight = Math.max(0, ptToPt100(args.raw.right));
    const rawBottom = Math.max(0, ptToPt100(args.raw.bottom));
    const rawLeft = Math.max(0, ptToPt100(args.raw.left));

    const maxTopBottomSum = Math.max(0, Math.round(args.pageH - args.headerH - args.footerH - args.minBody));

    if (args.linked) {
        const master = rawTop;
        const maxLinked = Math.floor(maxTopBottomSum / 2);
        const final = Math.max(0, Math.min(master, maxLinked));
        return {
            top: pt100ToPt(final),
            right: pt100ToPt(final),
            bottom: pt100ToPt(final),
            left: pt100ToPt(final),
        };
    }

    const top = Math.max(0, Math.min(rawTop, maxTopBottomSum));
    const maxBottom = Math.max(0, maxTopBottomSum - top);
    const bottom = Math.max(0, Math.min(rawBottom, maxBottom));

    return {
        top: pt100ToPt(top),
        right: pt100ToPt(rawRight),
        bottom: pt100ToPt(bottom),
        left: pt100ToPt(rawLeft),
    };
}

export function RightSidebar({
    doc,
    onOpenAddPreset,
}: {
    doc: DocumentJson;
    onOpenAddPreset?: () => void;
}) {
    const { session } = useEditorSessionStore();
    const { updatePresetMargin, setPageMarginSource, updatePageMargin, updateRepeatAreaHeightPt } = useEditorStore();
    const activePageId = session.activePageId ?? null;
    const selectedIds = session.selectedNodeIds ?? EMPTY_IDS;
    const selectedKey = selectedIds.join(",");

    const selection = useMemo(
        () => readSelectionContext(doc, activePageId, selectedIds),
        [doc, activePageId, selectedKey]
    );

    const showPage = selection.selectionType === "page" || selection.selectionType === "element";
    const showElement = selection.selectionType === "element";
    const selectedPageId = selection.currentPageId ?? activePageId;
    const page = selectedPageId ? doc.pagesById[selectedPageId] : null;
    const preset = page ? doc.pagePresetsById[page.presetId] : null;
    const effectiveMargin = page ? Sel.getEffectiveMargin(doc, page.id) : null;
    const hf = page ? Sel.getEffectiveHeaderFooterHeights(doc, page.id) : null;
    const marginSource: "preset" | "page" = (page?.marginSource ?? "preset") as "preset" | "page";
    const isCustomMargin = marginSource === "page";
    const minBodyPt100 = Cmd.DEFAULT_HF_CONSTRAINTS?.minBodyPt ?? MIN_BODY_PT100_FALLBACK;
    const pageIndex = page ? doc.pageOrder.indexOf(page.id) : -1;
    const pageNodeCount = page ? (doc.nodeOrderByPageId?.[page.id]?.length ?? 0) : null;

    const addRef = useRef<HTMLDivElement | null>(null);
    const pageRef = useRef<HTMLDivElement | null>(null);
    const elementRef = useRef<HTMLDivElement | null>(null);

    const [open, setOpen] = useState<CardOpenState>(DEFAULT_OPEN);
    const [activeTop, setActiveTop] = useState<"add" | "page" | "element">("add");
    const [marginLinked, setMarginLinked] = useState(true);
    const [linkedMarginPt, setLinkedMarginPt] = useState(0);
    const [marginPt, setMarginPt] = useState<MarginPt>({ top: 0, right: 0, bottom: 0, left: 0 });
    const [headerPt, setHeaderPt] = useState(0);
    const [footerPt, setFooterPt] = useState(0);
    const marginDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toggle = (key: keyof CardOpenState) => {
        setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const scrollTo = (target: "add" | "page" | "element") => {
        if (target === "add") {
            addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        if (target === "page") {
            pageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        elementRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const navButton = (active: boolean, disabled: boolean): React.CSSProperties => ({
        border: "1px solid #d1d5db",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
    });

    const onNavClick = (target: "add" | "page" | "element", enabled: boolean) => {
        if (!enabled) return;
        setActiveTop(target);
        scrollTo(target);
    };

    useEffect(() => {
        if (!page || !preset || !effectiveMargin) return;
        const next: MarginPt = {
            top: pt100ToPt(effectiveMargin.top),
            right: pt100ToPt(effectiveMargin.right),
            bottom: pt100ToPt(effectiveMargin.bottom),
            left: pt100ToPt(effectiveMargin.left),
        };
        setMarginPt(next);
        const allEqual = next.top === next.right && next.top === next.bottom && next.top === next.left;
        setMarginLinked(allEqual);
        setLinkedMarginPt(next.top);

        const nextHeader = pt100ToPt(hf?.headerH ?? 0);
        const nextFooter = pt100ToPt(hf?.footerH ?? 0);
        setHeaderPt(nextHeader);
        setFooterPt(nextFooter);
    }, [
        page?.id,
        preset?.id,
        effectiveMargin?.top,
        effectiveMargin?.right,
        effectiveMargin?.bottom,
        effectiveMargin?.left,
        hf?.headerH,
        hf?.footerH,
    ]);

    const onSetLinked = (nextLinked: boolean) => {
        if (!nextLinked) {
            setMarginLinked(false);
            const from = clampPt(linkedMarginPt, 0, MAX_MARGIN_PT);
            const next = { top: from, right: from, bottom: from, left: from };
            setMarginPt(next);
            return;
        }

        const master = clampPt(marginPt.top, 0, MAX_MARGIN_PT);
        const next = { top: master, right: master, bottom: master, left: master };
        setMarginLinked(true);
        setLinkedMarginPt(master);
        setMarginPt(next);
    };

    const onChangeLinkedMargin = (v: number) => {
        const next = clampPt(v, 0, MAX_MARGIN_PT);
        setLinkedMarginPt(next);
        const all = { top: next, right: next, bottom: next, left: next };
        setMarginPt(all);
    };

    const onChangeUnlinkedMargin = (side: keyof MarginPt, v: number) => {
        const next = { ...marginPt, [side]: clampPt(v, 0, MAX_MARGIN_PT) };
        setMarginPt(next);
    };

    const onChangeMarginSource = (nextSource: "preset" | "page") => {
        if (!page || !preset || !effectiveMargin) return;
        if (nextSource === marginSource) return;

        if (marginDebounceRef.current) {
            clearTimeout(marginDebounceRef.current);
            marginDebounceRef.current = null;
        }

        if (nextSource === "page") {
            // materialize page override from current effective margin, so switching source does not change visuals
            updatePageMargin(page.id, {
                top: effectiveMargin.top,
                right: effectiveMargin.right,
                bottom: effectiveMargin.bottom,
                left: effectiveMargin.left,
            });
            setPageMarginSource(page.id, "page");
            return;
        }

        setPageMarginSource(page.id, "preset");
    };

    const onChangeHeaderPt = (v: number) => {
        if (!page || !preset || !effectiveMargin || !hf) return;
        const desired = ptToPt100(clampPt(v, 0, 5000));
        const contentH = Math.max(0, preset.size.height - effectiveMargin.top - effectiveMargin.bottom);
        const clamped = Cmd.clampRepeatAreaHeightPt({
            kind: "header",
            desiredPt: desired,
            pageH: preset.size.height,
            contentH,
            otherPt: hf.footerH,
            areaMinPt: doc.headerFooterByPresetId?.[preset.id]?.header?.minHeightPt,
            areaMaxPt: doc.headerFooterByPresetId?.[preset.id]?.header?.maxHeightPt,
        });
        setHeaderPt(pt100ToPt(clamped));
        updateRepeatAreaHeightPt(preset.id, "header", clamped);
    };

    const onChangeFooterPt = (v: number) => {
        if (!page || !preset || !effectiveMargin || !hf) return;
        const desired = ptToPt100(clampPt(v, 0, 5000));
        const contentH = Math.max(0, preset.size.height - effectiveMargin.top - effectiveMargin.bottom);
        const clamped = Cmd.clampRepeatAreaHeightPt({
            kind: "footer",
            desiredPt: desired,
            pageH: preset.size.height,
            contentH,
            otherPt: hf.headerH,
            areaMinPt: doc.headerFooterByPresetId?.[preset.id]?.footer?.minHeightPt,
            areaMaxPt: doc.headerFooterByPresetId?.[preset.id]?.footer?.maxHeightPt,
        });
        setFooterPt(pt100ToPt(clamped));
        updateRepeatAreaHeightPt(preset.id, "footer", clamped);
    };

    useEffect(() => {
        if (!page || !preset || !hf || !effectiveMargin) return;

        if (marginDebounceRef.current) clearTimeout(marginDebounceRef.current);
        marginDebounceRef.current = setTimeout(() => {
            const clampedPt = clampMarginForBodyHeight({
                raw: marginPt,
                linked: marginLinked,
                pageH: preset.size.height,
                headerH: hf.headerH,
                footerH: hf.footerH,
                minBody: minBodyPt100,
            });

            const patch = {
                top: ptToPt100(clampedPt.top),
                right: ptToPt100(clampedPt.right),
                bottom: ptToPt100(clampedPt.bottom),
                left: ptToPt100(clampedPt.left),
            };

            const sourceMargin =
                marginSource === "page"
                    ? (page.marginOverride ?? effectiveMargin)
                    : preset.margin;

            if (
                sourceMargin.top === patch.top &&
                sourceMargin.right === patch.right &&
                sourceMargin.bottom === patch.bottom &&
                sourceMargin.left === patch.left
            ) {
                if (clampedPt.top !== marginPt.top || clampedPt.right !== marginPt.right || clampedPt.bottom !== marginPt.bottom || clampedPt.left !== marginPt.left) {
                    setMarginPt(clampedPt);
                    if (marginLinked) setLinkedMarginPt(clampedPt.top);
                }
                return;
            }

            setMarginPt(clampedPt);
            if (marginLinked) setLinkedMarginPt(clampedPt.top);

            if (marginSource === "page") {
                updatePageMargin(page.id, patch);
                return;
            }
            updatePresetMargin(preset.id, patch);
        }, 250);

        return () => {
            if (marginDebounceRef.current) {
                clearTimeout(marginDebounceRef.current);
                marginDebounceRef.current = null;
            }
        };
    }, [
        page?.id,
        page?.marginOverride,
        preset?.id,
        preset?.margin,
        preset?.size.height,
        hf?.headerH,
        hf?.footerH,
        effectiveMargin?.top,
        effectiveMargin?.right,
        effectiveMargin?.bottom,
        effectiveMargin?.left,
        marginPt.top,
        marginPt.right,
        marginPt.bottom,
        marginPt.left,
        marginLinked,
        marginSource,
        minBodyPt100,
        updatePageMargin,
        updatePresetMargin,
    ]);

    useEffect(() => {
        return () => {
            if (marginDebounceRef.current) {
                clearTimeout(marginDebounceRef.current);
                marginDebounceRef.current = null;
            }
        };
    }, []);

    return (
        <div
            style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#f9fafb",
                fontFamily: "system-ui",
            }}
        >
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    padding: 12,
                    background: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                }}
            >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Inspector</div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => onNavClick("add", true)}
                        style={navButton(activeTop === "add", false)}
                    >
                        Add
                    </button>
                    <button
                        type="button"
                        disabled={!showPage}
                        onClick={() => onNavClick("page", showPage)}
                        style={navButton(activeTop === "page", !showPage)}
                    >
                        Page
                    </button>
                    <button
                        type="button"
                        disabled={!showElement}
                        onClick={() => onNavClick("element", showElement)}
                        style={navButton(activeTop === "element", !showElement)}
                    >
                        Element
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 12 }}>
                <section ref={addRef} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Add</div>
                    <CollapsibleSection open={open.addContent} onToggle={() => toggle("addContent")} title="Content">
                        <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
                            Placeholder content tools for adding text, image, shape, and fields.
                        </div>
                    </CollapsibleSection>
                    <CollapsibleSection open={open.addLayout} onToggle={() => toggle("addLayout")} title="Layout">
                        <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5, marginBottom: 8 }}>
                            Placeholder layout tools for sections, grids, and spacing.
                        </div>
                        <button
                            type="button"
                            onClick={onOpenAddPreset}
                            style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#fff",
                                cursor: "pointer",
                                fontWeight: 800,
                            }}
                        >
                            Add preset
                        </button>
                    </CollapsibleSection>
                </section>

                {showPage && (
                    <section ref={pageRef} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>Page</div>
                        {!page || !preset ? (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>No page selected</div>
                        ) : (
                            <>
                                <CollapsibleSection open={open.pagePaper} onToggle={() => toggle("pagePaper")} title="Paper">
                                    <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
                                        <div>Preset: {preset.name || preset.id}</div>
                                        <div>Orientation: {getOrientation(preset)}</div>
                                        <div>
                                            Size: {fmtPt(pt100ToPt(preset.size.width))} × {fmtPt(pt100ToPt(preset.size.height))} pt
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled
                                        style={{
                                            marginTop: 10,
                                            padding: "6px 10px",
                                            borderRadius: 10,
                                            border: "1px solid #e5e7eb",
                                            background: "#fff",
                                            cursor: "not-allowed",
                                            opacity: 0.55,
                                            fontWeight: 800,
                                        }}
                                    >
                                        Change...
                                    </button>
                                </CollapsibleSection>

                                <CollapsibleSection open={open.pageMargins} onToggle={() => toggle("pageMargins")} title="Margin">
                                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                        <button
                                            type="button"
                                            onClick={() => onChangeMarginSource("preset")}
                                            style={navButton(!isCustomMargin, false)}
                                        >
                                            Use preset
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onChangeMarginSource("page")}
                                            style={navButton(isCustomMargin, false)}
                                        >
                                            Custom
                                        </button>
                                    </div>

                                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                        <button
                                            type="button"
                                            onClick={() => onSetLinked(true)}
                                            style={navButton(marginLinked, false)}
                                        >
                                            Link
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onSetLinked(false)}
                                            style={navButton(!marginLinked, false)}
                                        >
                                            Unlink
                                        </button>
                                    </div>

                                    {marginLinked ? (
                                        <div>
                                            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Margin (pt)</div>
                                            <input
                                                type="number"
                                                value={linkedMarginPt}
                                                min={0}
                                                step={1}
                                                onChange={(e) => onChangeLinkedMargin(Number(e.target.value))}
                                                style={{
                                                    width: "100%",
                                                    padding: "6px 8px",
                                                    borderRadius: 10,
                                                    border: "1px solid #e5e7eb",
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            {(["top", "right", "bottom", "left"] as const).map((side) => (
                                                <label key={side} style={{ fontSize: 12, color: "#374151" }}>
                                                    {side[0].toUpperCase() + side.slice(1)} (pt)
                                                    <input
                                                        type="number"
                                                        value={marginPt[side]}
                                                        min={0}
                                                        step={1}
                                                        onChange={(e) => onChangeUnlinkedMargin(side, Number(e.target.value))}
                                                        style={{
                                                            marginTop: 4,
                                                            width: "100%",
                                                            padding: "6px 8px",
                                                            borderRadius: 10,
                                                            border: "1px solid #e5e7eb",
                                                        }}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </CollapsibleSection>

                                <CollapsibleSection
                                    open={open.pageHeaderFooter}
                                    onToggle={() => toggle("pageHeaderFooter")}
                                    title="Header / Footer"
                                >
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                        <label style={{ fontSize: 12, color: "#374151" }}>
                                            Header height (pt)
                                            <input
                                                type="number"
                                                value={headerPt}
                                                min={0}
                                                step={1}
                                                onChange={(e) => onChangeHeaderPt(Number(e.target.value))}
                                                style={{
                                                    marginTop: 4,
                                                    width: "100%",
                                                    padding: "6px 8px",
                                                    borderRadius: 10,
                                                    border: "1px solid #e5e7eb",
                                                }}
                                            />
                                        </label>
                                        <label style={{ fontSize: 12, color: "#374151" }}>
                                            Footer height (pt)
                                            <input
                                                type="number"
                                                value={footerPt}
                                                min={0}
                                                step={1}
                                                onChange={(e) => onChangeFooterPt(Number(e.target.value))}
                                                style={{
                                                    marginTop: 4,
                                                    width: "100%",
                                                    padding: "6px 8px",
                                                    borderRadius: 10,
                                                    border: "1px solid #e5e7eb",
                                                }}
                                            />
                                        </label>
                                    </div>
                                </CollapsibleSection>

                                <CollapsibleSection open={open.pageInfo} onToggle={() => toggle("pageInfo")} title="Info">
                                    <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.7 }}>
                                        <div>activePageId: {activePageId ?? "N/A"}</div>
                                        <div>presetId: {page.presetId}</div>
                                        <div>pageIndex: {pageIndex >= 0 ? pageIndex + 1 : "N/A"}</div>
                                        <div>nodeCount: {pageNodeCount ?? "N/A"}</div>
                                    </div>
                                </CollapsibleSection>
                            </>
                        )}
                    </section>
                )}
                {!showPage && !activePageId && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                        No page selected
                    </div>
                )}

                {showElement && (
                    <section ref={elementRef} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>Element</div>
                        <CollapsibleSection open={open.elementLayout} onToggle={() => toggle("elementLayout")} title="Layout">
                            <div style={{ fontSize: 12, color: "#4b5563" }}>
                                Placeholder element layout controls.
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection open={open.elementStyle} onToggle={() => toggle("elementStyle")} title="Style">
                            <div style={{ fontSize: 12, color: "#4b5563" }}>
                                Placeholder element style controls.
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection open={open.elementData} onToggle={() => toggle("elementData")} title="Data">
                            <div style={{ fontSize: 12, color: "#4b5563" }}>
                                Placeholder element data bindings.
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection open={open.elementAdvanced} onToggle={() => toggle("elementAdvanced")} title="Advanced">
                            <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
                                Placeholder advanced element controls.
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                                Current element: {selection.currentElementId ?? "N/A"}
                            </div>
                        </CollapsibleSection>
                    </section>
                )}
            </div>
        </div>
    );
}
