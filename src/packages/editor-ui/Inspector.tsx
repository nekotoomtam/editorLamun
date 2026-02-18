"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { pt100ToPt, ptToPt100, type DocumentJson, type Id, type PagePreset } from "../editor-core/schema";
import { getOrientation } from "../editor-core/schema";
import { useEditorStore } from "./store/editorStore";
import CollapsibleSection from "./CollapsibleSection";

type InspectorCollapse = {
    page: boolean;
    paper: boolean;
    hf: boolean;
    margins: boolean;
};

const DEFAULT_OPEN: InspectorCollapse = {
    page: true,
    paper: false,
    hf: false,
    margins: true,
};

const collapseKey = (pageId: string) => `inspector-collapse:${pageId}`;

function readCollapse(pageId: string): InspectorCollapse {
    try {
        const raw = localStorage.getItem(collapseKey(pageId));
        if (!raw) return DEFAULT_OPEN;
        const v = JSON.parse(raw);
        return {
            page: !!v.page,
            paper: !!v.paper,
            hf: !!v.hf,
            margins: !!v.margins,
        };
    } catch {
        return DEFAULT_OPEN;
    }
}

function writeCollapse(pageId: string, state: InspectorCollapse) {
    try {
        localStorage.setItem(collapseKey(pageId), JSON.stringify(state));
    } catch { }
}


function clampInt(n: number, min: number, max: number) {
    const x = Number.isFinite(n) ? n : min;
    return Math.max(min, Math.min(max, Math.round(x)));
}

function FieldRow({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr",
                gap: 10,
                alignItems: "center",
                marginBottom: 10,
            }}
        >
            <div style={{ color: "#374151", fontWeight: 600, fontSize: 12 }}>{label}</div>
            <div style={{ minWidth: 0 }}>{children}</div>
        </div>
    );
}


export function Inspector({
    doc,
    activePageId,
    onOpenAddPreset,
    onOpenEditPreset,
}: {
    doc: DocumentJson;
    activePageId: Id | null;
    onOpenAddPreset?: () => void;
    onOpenEditPreset?: (presetId: Id) => void;
}) {
    const {
        setPagePreset: setPagePresetAction,
        updatePresetSize: updatePresetSizeAction,
        updatePresetMargin: updatePresetMarginAction,
        setPresetOrientation: setPresetOrientationAction,

        // ✅ NEW
        setPageMarginSource,
        updatePageMargin,
        updateRepeatAreaHeightPt,
        updateRepeatAreaAnchorToMargins,
        setPageHeaderFooterHidden,
    } = useEditorStore();

    const page = activePageId ? doc.pagesById[activePageId] : null;
    const preset = page ? doc.pagePresetsById[page.presetId] : null;

    const [open, setOpen] = useState<InspectorCollapse>(DEFAULT_OPEN);

    useEffect(() => {
        if (!page?.id) return;
        setOpen(readCollapse(page.id));
    }, [page?.id]);

    useEffect(() => {
        if (!page?.id) return;
        writeCollapse(page.id, open);
    }, [page?.id, open]);

    const toggle = (k: keyof InspectorCollapse) =>
        setOpen((s) => ({ ...s, [k]: !s[k] }));
    const setPagePreset = (nextPresetId: Id) => {
        if (!page) return;
        setPagePresetAction(page.id, nextPresetId);
    };

    const updatePresetSize = (patch: Partial<PagePreset["size"]>) => {
        if (!preset) return;
        updatePresetSizeAction(preset.id, patch);
    };

    const setPresetOrientation = (mode: "portrait" | "landscape") => {
        if (!preset) return;
        setPresetOrientationAction(preset.id, mode);
    };

    const updatePresetMargin = (patch: Partial<PagePreset["margin"]>) => {
        if (!preset) return;
        updatePresetMarginAction(preset.id, patch);
    };

    const presetOptions = useMemo(() => {
        return doc.pagePresetOrder
            .map((id) => doc.pagePresetsById[id])
            .filter((p): p is PagePreset => Boolean(p));
    }, [doc.pagePresetOrder, doc.pagePresetsById]);

    // ✅ NEW: margin source
    const marginSource = (page?.marginSource ?? "preset") as "preset" | "page";

    // ✅ NEW: effective margin ตาม source
    const effectiveMargin = useMemo(() => {
        if (!preset || !page) return null;
        if (marginSource === "page") return page.marginOverride ?? preset.margin;
        return preset.margin;
    }, [preset, page, marginSource]);

    if (!page || !preset) {
        return (
            <div style={{ padding: 12, fontFamily: "system-ui", fontSize: 14 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Inspector</div>
                <div style={{ color: "#6b7280" }}>No active page</div>
            </div>
        );
    }

    const isLocked = !!preset?.locked;
    const usageHint = preset?.usageHint;
    const orientation = getOrientation(preset);

    const btnStyle = (disabled: boolean): React.CSSProperties => ({
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#fff",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
    });

    // ✅ NEW: ปุ่มเลือก source (แทน checkbox)
    const sourceBtnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 800,
        whiteSpace: "nowrap",
    });

    // ✅ NEW: change margin route ตาม source
    const onChangeMargin = (side: "top" | "right" | "bottom" | "left", raw: number) => {
        const v = ptToPt100(clampInt(raw, 0, 500));

        if (marginSource === "preset") {
            if (isLocked) return;
            updatePresetMarginAction(preset.id, { [side]: v } as any);
        } else {
            const next = { ...(page.marginOverride ?? preset.margin), [side]: v };
            updatePageMargin(page.id, next); // ให้ store แปลงไป setPageMarginOverride
        }
    };

    return (
        <div
            style={{
                padding: 12,
                fontFamily: "system-ui",
                fontSize: 14,
                background: "#f9fafb",
                height: "100%",
                overflowY: "auto",
                overflowX: "hidden",
                boxSizing: "border-box",
            }}
        >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Inspector</div>

            {usageHint && (
                <div
                    style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#fef3c7",
                        color: "#92400e",
                        fontSize: 12,
                        marginBottom: 10,
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                    }}
                >
                    {usageHint}
                </div>
            )}

            {/* <CollapsibleSection open={open.page} onToggle={() => toggle("page")} title="Page">
                <FieldRow label="Page">
                    <div style={{ fontWeight: 700 }}>{page.name ?? page.id}</div>
                </FieldRow>

                <FieldRow label="Preset">
                    <select
                        value={page.presetId}
                        onChange={(e) => setPagePreset(e.target.value as Id)}
                        style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                        }}
                    >
                        {presetOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} {p.source === "custom" ? "(custom)" : ""}
                            </option>
                        ))}
                    </select>
                </FieldRow>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                        onClick={() => onOpenAddPreset?.()}
                        style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 800,
                        }}
                    >
                        + Add preset
                    </button>
                </div>
            </CollapsibleSection > */}

            <CollapsibleSection open={open.paper} onToggle={() => toggle("paper")} title="Paper">
                <FieldRow label="Preset">
                    <div
                        style={{
                            position: "relative",
                            paddingRight: 36, // กันพื้นที่ให้ปุ่ม
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 800,
                                color: "#111827",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                            title={preset.name}
                        >
                            {preset.name}
                        </div>

                        <button
                            type="button"
                            onClick={() => onOpenEditPreset?.(page.presetId)}
                            style={{
                                position: "absolute",
                                right: 0,
                                top: -2,
                                width: 28,
                                height: 28,
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#fff",
                                cursor: "pointer",
                                fontWeight: 900,
                                display: "grid",
                                placeItems: "center",
                                opacity: 0.85,
                            }}
                            title="Edit paper"
                            aria-label="Edit paper"
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
                        >
                            ✎
                        </button>
                    </div>
                </FieldRow>


                <FieldRow label="Orientation">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 700, color: "#374151" }}>
                            {orientation === "portrait" ? "Portrait" : "Landscape"}
                        </div>

                    </div>
                </FieldRow>

                <FieldRow label="Source">
                    <div style={{ color: "#6b7280", fontWeight: 700 }}>{preset.source ?? "custom"}</div>
                </FieldRow>
            </CollapsibleSection >
            <CollapsibleSection open={open.hf} onToggle={() => toggle("hf")} title="Header / Footer">
                {(() => {
                    const hf = doc.headerFooterByPresetId?.[preset.id];
                    const headerPt = hf?.header?.heightPt ?? 0;
                    const footerPt = hf?.footer?.heightPt ?? 0;
                    const headerAnchor = hf?.header?.anchorToMargins ?? true;
                    const footerAnchor = hf?.footer?.anchorToMargins ?? true;

                    const headerEnabled = headerPt > 0;
                    const footerEnabled = footerPt > 0;

                    const setHeaderEnabled = (on: boolean) => {
                        // เปิด = default 100, ปิด = 0
                        updateRepeatAreaHeightPt(preset.id, "header", on ? (headerPt || 10000) : 0);
                        // ถ้าปิด preset ก็เคลียร์ hide ของ page ให้กลับมาเป็น false จะได้ไม่งง
                        if (!on) setPageHeaderFooterHidden(page.id, { headerHidden: false });
                    };

                    const setFooterEnabled = (on: boolean) => {
                        updateRepeatAreaHeightPt(preset.id, "footer", on ? (footerPt || 8000) : 0);
                        if (!on) setPageHeaderFooterHidden(page.id, { footerHidden: false });
                    };

                    return (
                        <>
                            <FieldRow label="Header">
                                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={headerEnabled}
                                        onChange={(e) => setHeaderEnabled(e.target.checked)}
                                    />
                                    <span style={{ fontSize: 12, color: "#374151" }}>Enable</span>
                                </label>
                            </FieldRow>

                            {headerEnabled && (
                                <>
                                    <FieldRow label="Height">
                                        <input
                                            type="number"
                                            value={pt100ToPt(headerPt)}
                                            min={0}
                                            onChange={(e) => updateRepeatAreaHeightPt(preset.id, "header", ptToPt100(clampInt(Number(e.target.value), 0, 600)))}
                                            style={{
                                                width: "100%",
                                                padding: "6px 8px",
                                                borderRadius: 10,
                                                border: "1px solid #e5e7eb",
                                            }}
                                        />
                                    </FieldRow>

                                    <FieldRow label="Anchor">
                                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={headerAnchor}
                                                onChange={(e) => updateRepeatAreaAnchorToMargins(preset.id, "header", e.target.checked)}
                                            />
                                            <span style={{ fontSize: 12, color: "#374151" }}>Anchor to margins</span>
                                        </label>
                                    </FieldRow>

                                    <FieldRow label="This page">
                                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={!!page.headerHidden}
                                                onChange={(e) => setPageHeaderFooterHidden(page.id, { headerHidden: e.target.checked })}
                                            />
                                            <span style={{ fontSize: 12, color: "#374151" }}>Hide header</span>
                                        </label>
                                    </FieldRow>
                                </>
                            )}

                            <div style={{ height: 10 }} />

                            <FieldRow label="Footer">
                                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={footerEnabled}
                                        onChange={(e) => setFooterEnabled(e.target.checked)}
                                    />
                                    <span style={{ fontSize: 12, color: "#374151" }}>Enable</span>
                                </label>
                            </FieldRow>

                            {footerEnabled && (
                                <>
                                    <FieldRow label="Height">
                                        <input
                                            type="number"
                                            value={pt100ToPt(footerPt)}
                                            min={0}
                                            onChange={(e) => updateRepeatAreaHeightPt(preset.id, "footer", ptToPt100(clampInt(Number(e.target.value), 0, 600)))}
                                            style={{
                                                width: "100%",
                                                padding: "6px 8px",
                                                borderRadius: 10,
                                                border: "1px solid #e5e7eb",
                                            }}
                                        />
                                    </FieldRow>

                                    <FieldRow label="Anchor">
                                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={footerAnchor}
                                                onChange={(e) => updateRepeatAreaAnchorToMargins(preset.id, "footer", e.target.checked)}
                                            />
                                            <span style={{ fontSize: 12, color: "#374151" }}>Anchor to margins</span>
                                        </label>
                                    </FieldRow>

                                    <FieldRow label="This page">
                                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={!!page.footerHidden}
                                                onChange={(e) => setPageHeaderFooterHidden(page.id, { footerHidden: e.target.checked })}
                                            />
                                            <span style={{ fontSize: 12, color: "#374151" }}>Hide footer</span>
                                        </label>
                                    </FieldRow>
                                </>
                            )}
                        </>
                    );
                })()}
            </CollapsibleSection >

            <CollapsibleSection open={open.margins} onToggle={() => toggle("margins")} title="Margins">
                {/* ✅ NEW: source selector */}
                <FieldRow label="Applies to">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                            type="button"
                            disabled={false}
                            onClick={() => setPageMarginSource(page.id, "preset")}
                            style={sourceBtnStyle(marginSource === "preset", false)}
                        >
                            Paper
                        </button>
                        <button
                            type="button"
                            disabled={false}
                            onClick={() => setPageMarginSource(page.id, "page")}
                            style={sourceBtnStyle(marginSource === "page", false)}
                        >
                            This page
                        </button>
                        <div style={{ flex: 1 }} />
                    </div>
                </FieldRow>

                {marginSource === "preset" && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: -6, marginBottom: 10, lineHeight: 1.4 }}>
                        Editing <b>Paper</b> margin affects all pages using this Paper.
                        {isLocked ? " (This Paper is locked)" : ""}
                    </div>
                )}

                <FieldRow label="Top">
                    <input
                        type="number"
                        disabled={marginSource === "preset" ? isLocked : false}
                        value={pt100ToPt(effectiveMargin?.top ?? preset.margin.top)}
                        onChange={(e) => onChangeMargin("top", Number(e.target.value))}
                        style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                        }}
                    />
                </FieldRow>

                <FieldRow label="Right">
                    <input
                        type="number"
                        disabled={marginSource === "preset" ? isLocked : false}
                        value={pt100ToPt(effectiveMargin?.right ?? preset.margin.right)}
                        onChange={(e) => onChangeMargin("right", Number(e.target.value))}
                        style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                        }}
                    />
                </FieldRow>

                <FieldRow label="Bottom">
                    <input
                        type="number"
                        disabled={marginSource === "preset" ? isLocked : false}
                        value={pt100ToPt(effectiveMargin?.bottom ?? preset.margin.bottom)}
                        onChange={(e) => onChangeMargin("bottom", Number(e.target.value))}
                        style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                        }}
                    />
                </FieldRow>

                <FieldRow label="Left">
                    <input
                        type="number"
                        disabled={marginSource === "preset" ? isLocked : false}
                        value={pt100ToPt(effectiveMargin?.left ?? preset.margin.left)}
                        onChange={(e) => onChangeMargin("left", Number(e.target.value))}
                        style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                        }}
                    />
                </FieldRow>

                {isLocked && marginSource === "preset" && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                        Paper นี้ถูกล็อก — ถ้าต้องการปรับเฉพาะหน้า ให้เลือก <b>This page</b>
                    </div>
                )}
            </CollapsibleSection >
        </div>
    );
}
