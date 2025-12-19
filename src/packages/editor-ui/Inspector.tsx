"use client";

import React, { useMemo } from "react";
import type { DocumentJson, Id, PagePreset } from "../editor-core/schema";
import { getOrientation, normalizePresetOrientation } from "../editor-core/schema";

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
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: "#374151", fontWeight: 600, fontSize: 12 }}>{label}</div>
            <div style={{ minWidth: 0 }}>{children}</div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 12, background: "#fff" }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
            {children}
        </div>
    );
}

export function Inspector({
    doc,
    activePageId,
    setDoc,
}: {
    doc: DocumentJson;
    activePageId: Id | null;
    setDoc: React.Dispatch<React.SetStateAction<DocumentJson>>;
}) {
    const page = activePageId ? doc.pagesById[activePageId] : null;
    const preset = page ? doc.pagePresetsById[page.presetId] : null;



    const presetOptions = useMemo(() => {
        return doc.pagePresetOrder
            .map((id) => doc.pagePresetsById[id])
            .filter(Boolean);
    }, [doc.pagePresetOrder, doc.pagePresetsById]);

    const effectiveMargin = useMemo(() => {
        if (!preset) return null;
        const base = preset.margin;
        const ov = page?.override?.margin;
        return ov ? { ...base, ...ov } : base;
    }, [preset, page?.override?.margin]);

    const setPagePreset = (nextPresetId: Id) => {
        if (!page) return;
        setDoc((prev) => ({
            ...prev,
            pagesById: {
                ...prev.pagesById,
                [page.id]: {
                    ...prev.pagesById[page.id],
                    presetId: nextPresetId,
                },
            },
        }));
    };

    const updatePresetSize = (patch: Partial<PagePreset["size"]>) => {
        if (!preset) return;
        setDoc((prev) => ({
            ...prev,
            pagePresetsById: {
                ...prev.pagePresetsById,
                [preset.id]: {
                    ...prev.pagePresetsById[preset.id],
                    size: { ...prev.pagePresetsById[preset.id].size, ...patch },
                    source: prev.pagePresetsById[preset.id].source ?? "custom",
                },
            },
        }));
    };

    const setPresetOrientation = (mode: "portrait" | "landscape") => {
        if (!preset) return;
        setDoc((prev) => ({
            ...prev,
            pagePresetsById: {
                ...prev.pagePresetsById,
                [preset.id]: normalizePresetOrientation(prev.pagePresetsById[preset.id], mode),
            },
        }));
    };

    const updatePresetMargin = (patch: Partial<PagePreset["margin"]>) => {
        if (!preset) return;
        setDoc((prev) => ({
            ...prev,
            pagePresetsById: {
                ...prev.pagePresetsById,
                [preset.id]: {
                    ...prev.pagePresetsById[preset.id],
                    margin: { ...prev.pagePresetsById[preset.id].margin, ...patch },
                    source: prev.pagePresetsById[preset.id].source ?? "custom",
                },
            },
        }));
    };

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
            }}>
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
                        onChange={(e) => setPagePreset(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                        {presetOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} {p.source === "custom" ? "(custom)" : ""}
                            </option>
                        ))}
                    </select>
                </FieldRow>
            </Section>

            <Section title="Paper">
                <FieldRow label="Size">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <input
                            type="number"
                            disabled={isLocked}
                            value={preset.size.width}
                            onChange={(e) => updatePresetSize({ width: clampInt(Number(e.target.value), 100, 5000) })}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                        />
                        <input
                            type="number"
                            disabled={isLocked}
                            value={preset.size.height}
                            onChange={(e) => updatePresetSize({ height: clampInt(Number(e.target.value), 100, 5000) })}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                        />
                    </div>
                </FieldRow>

                <FieldRow label="Orientation">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 700, color: "#374151" }}>
                            {orientation === "portrait" ? "Portrait" : "Landscape"}
                        </div>
                        <div style={{ flex: 1 }} />
                        <button
                            disabled={isLocked}
                            onClick={() => setPresetOrientation("portrait")}
                            style={btnStyle(isLocked)}
                        >
                            Portrait
                        </button>
                        <button
                            disabled={isLocked}
                            onClick={() => setPresetOrientation("landscape")}
                            style={btnStyle(isLocked)}
                        >
                            Landscape
                        </button>
                    </div>
                </FieldRow>

                <FieldRow label="Source">
                    <div style={{ color: "#6b7280", fontWeight: 700 }}>
                        {preset.source ?? "custom"}
                    </div>
                </FieldRow>
            </Section>
            <FieldRow label="Status">
                {isLocked ? (
                    <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>
                        Locked
                    </div>
                ) : (
                    <div style={{ color: "#6b7280" }}>Editable</div>
                )}
            </FieldRow>

            <Section title="Margins">
                <FieldRow label="Top">
                    <input
                        type="number"
                        disabled={isLocked}
                        value={effectiveMargin?.top ?? preset.margin.top}
                        onChange={(e) => updatePresetMargin({ top: clampInt(Number(e.target.value), 0, 500) })}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    />
                </FieldRow>
                <FieldRow label="Right">
                    <input
                        type="number"
                        disabled={isLocked}
                        value={effectiveMargin?.right ?? preset.margin.right}
                        onChange={(e) => updatePresetMargin({ right: clampInt(Number(e.target.value), 0, 500) })}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    />
                </FieldRow>
                <FieldRow label="Bottom">
                    <input
                        type="number"
                        disabled={isLocked}
                        value={effectiveMargin?.bottom ?? preset.margin.bottom}
                        onChange={(e) => updatePresetMargin({ bottom: clampInt(Number(e.target.value), 0, 500) })}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    />
                </FieldRow>
                <FieldRow label="Left">
                    <input
                        type="number"
                        disabled={isLocked}
                        value={effectiveMargin?.left ?? preset.margin.left}
                        onChange={(e) => updatePresetMargin({ left: clampInt(Number(e.target.value), 0, 500) })}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    />
                </FieldRow>

                {isLocked && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                        Preset นี้ถูกล็อก
                        แนะนำให้ใช้ <b>override ต่อหน้า</b> แทน (กำลังจะรองรับ)
                    </div>
                )}
            </Section>
        </div>
    );
}
