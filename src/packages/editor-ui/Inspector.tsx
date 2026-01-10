"use client";

import React, { useMemo } from "react";
import type { DocumentJson, Id, PagePreset } from "../editor-core/schema";
import { getOrientation } from "../editor-core/schema";
import { useEditorStore } from "./store/editorStore";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                background: "#fff",
            }}
        >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
            {children}
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
        setPresetHeaderHeightPx,
        setPresetFooterHeightPx,
        setPageHeaderFooterHidden,
    } = useEditorStore();

    const page = activePageId ? doc.pagesById[activePageId] : null;
    const preset = page ? doc.pagePresetsById[page.presetId] : null;

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

        if (marginSource === "page" && page.pageMargin) {
            return page.pageMargin;
        }

        // fallback เผื่อไฟล์เก่า (ยังมี marginOverride)
        const base = preset.margin;
        const ov = page.marginOverride;
        return ov ? { ...base, ...ov } : base;
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
        const v = clampInt(raw, 0, 500);

        if (marginSource === "preset") {
            // preset ถูกล็อก = ห้ามแก้ preset margin
            if (isLocked) return;
            updatePresetMargin({ [side]: v } as Partial<PagePreset["margin"]>);
        } else {
            updatePageMargin(page.id, { [side]: v } as Partial<PagePreset["margin"]>);
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

            <Section title="Page">
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
            </Section>

            <Section title="Paper">
                <FieldRow label="Preset">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 800, color: "#111827" }}>{preset.name}</div>

                        <button
                            type="button"
                            onClick={() => onOpenEditPreset?.(page.presetId)}
                            style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#fff",
                                cursor: "pointer",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            ✎ Edit
                        </button>
                    </div>
                </FieldRow>

                <FieldRow label="Orientation">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 700, color: "#374151" }}>
                            {orientation === "portrait" ? "Portrait" : "Landscape"}
                        </div>
                        <div style={{ flex: 1 }} />
                        <button disabled={true} onClick={() => setPresetOrientation("portrait")} style={btnStyle(isLocked)}>
                            Portrait
                        </button>
                        <button disabled={true} onClick={() => setPresetOrientation("landscape")} style={btnStyle(isLocked)}>
                            Landscape
                        </button>
                    </div>
                </FieldRow>

                <FieldRow label="Source">
                    <div style={{ color: "#6b7280", fontWeight: 700 }}>{preset.source ?? "custom"}</div>
                </FieldRow>
            </Section>
            <Section title="Header / Footer">
                {(() => {
                    const hf = doc.headerFooterByPresetId?.[preset.id];
                    const headerPx = hf?.header?.heightPx ?? 0;
                    const footerPx = hf?.footer?.heightPx ?? 0;

                    const headerEnabled = headerPx > 0;
                    const footerEnabled = footerPx > 0;

                    const setHeaderEnabled = (on: boolean) => {
                        // เปิด = default 100, ปิด = 0
                        setPresetHeaderHeightPx(preset.id, on ? (headerPx || 100) : 0);
                        // ถ้าปิด preset ก็เคลียร์ hide ของ page ให้กลับมาเป็น false จะได้ไม่งง
                        if (!on) setPageHeaderFooterHidden(page.id, { headerHidden: false });
                    };

                    const setFooterEnabled = (on: boolean) => {
                        setPresetFooterHeightPx(preset.id, on ? (footerPx || 80) : 0);
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
                                            value={headerPx}
                                            min={0}
                                            onChange={(e) => setPresetHeaderHeightPx(preset.id, clampInt(Number(e.target.value), 0, 600))}
                                            style={{
                                                width: "100%",
                                                padding: "6px 8px",
                                                borderRadius: 10,
                                                border: "1px solid #e5e7eb",
                                            }}
                                        />
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
                                            value={footerPx}
                                            min={0}
                                            onChange={(e) => setPresetFooterHeightPx(preset.id, clampInt(Number(e.target.value), 0, 600))}
                                            style={{
                                                width: "100%",
                                                padding: "6px 8px",
                                                borderRadius: 10,
                                                border: "1px solid #e5e7eb",
                                            }}
                                        />
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
            </Section>

            <FieldRow label="Status">
                {isLocked ? (
                    <div
                        style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            background: "#fee2e2",
                            color: "#991b1b",
                            fontWeight: 700,
                        }}
                    >
                        Locked
                    </div>
                ) : (
                    <div style={{ color: "#6b7280" }}>Editable</div>
                )}
            </FieldRow>

            <Section title="Margins">
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
                        value={effectiveMargin?.top ?? preset.margin.top}
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
                        value={effectiveMargin?.right ?? preset.margin.right}
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
                        value={effectiveMargin?.bottom ?? preset.margin.bottom}
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
                        value={effectiveMargin?.left ?? preset.margin.left}
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
            </Section>
        </div>
    );
}
