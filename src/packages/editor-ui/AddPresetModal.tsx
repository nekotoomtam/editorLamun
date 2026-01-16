"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { DocumentJson, Id, PagePreset } from "../editor-core/schema";

const PAPER_PRESETS = [
    { key: "A4", name: "A4", w: 820, h: 1160 },
    { key: "A3", name: "A3", w: 1160, h: 1640 },
    { key: "LETTER", name: "Letter", w: 816, h: 1056 },
    { key: "LEGAL", name: "Legal", w: 816, h: 1344 },
] as const;

type PaperKey = (typeof PAPER_PRESETS)[number]["key"];

type Draft = {
    name: string;
    orientation: "portrait" | "landscape";
    paperKey: PaperKey;
};

type PresetModalMode = "create" | "edit" | "delete";

function guessPaperKeyFromSize(w: number, h: number): PaperKey {
    // normalize ให้ w<=h ก่อน (ดู paper preset แบบ portrait)
    const nw = Math.min(w, h);
    const nh = Math.max(w, h);

    let best: { key: PaperKey; score: number } | null = null;

    for (const p of PAPER_PRESETS) {
        const pw = Math.min(p.w, p.h);
        const ph = Math.max(p.w, p.h);

        const score = Math.abs(nw - pw) + Math.abs(nh - ph);
        if (!best || score < best.score) best = { key: p.key, score };
    }

    // threshold กันมั่ว (ถ้าห่างมากให้ default A4)
    if (!best) return "A4";
    return best.score <= 120 ? best.key : "A4";
}

function getPaper(paperKey: PaperKey) {
    return PAPER_PRESETS.find((p) => p.key === paperKey) ?? PAPER_PRESETS[0];
}

export function AddPresetModal({
    open,
    doc,
    mode,
    presetMode,
    presetId,
    onClose,
    onCreate,
    onUpdate,
    onDelete,
    onRequestDelete,
    initialCloneFromId,

}: {
    open: boolean;
    doc: DocumentJson;
    mode: "bootstrap" | "library";

    presetMode: PresetModalMode;
    presetId?: Id | null;

    onClose: () => void;

    onCreate: (draft: Draft, extra?: { cloneFromId?: string }) => void;

    // NOTE: ไม่บังคับให้ schema มี paperKey — เราจะส่ง size ให้แทนตอน update
    onUpdate: (
        presetId: Id,
        patch: Partial<PagePreset> & { orientation?: "portrait" | "landscape" }
    ) => void;

    onDelete: (presetId: Id, opts: { reassignMap: Record<Id, Id> }) => void;


    onRequestDelete?: (presetId: Id) => void;
    initialCloneFromId?: string;
}) {
    const isBootstrap = mode === "bootstrap";

    // ===== Preset options =====
    const presetOptions = useMemo(() => {
        return doc.pagePresetOrder
            .map((id) => doc.pagePresetsById[id])
            .filter((p): p is PagePreset => Boolean(p));
    }, [doc.pagePresetOrder, doc.pagePresetsById]);

    // ===== target preset (edit/delete) =====
    const targetPreset: PagePreset | null = useMemo(() => {
        if (!presetId) return null;
        return doc.pagePresetsById[presetId] ?? null;
    }, [presetId, doc.pagePresetsById]);

    const isLocked = !!targetPreset?.locked;

    // ===== create: clone dropdown =====
    const CLONE_A4 = "__A4__";
    const [cloneFromId, setCloneFromId] = useState<string>(CLONE_A4);

    // ===== shared form state =====
    const [name, setName] = useState("A4 Portrait");
    const [ori, setOri] = useState<"portrait" | "landscape">("portrait");
    const [nameTouched, setNameTouched] = useState(false);

    // ✅ NEW: paper preset state
    const [paperKey, setPaperKey] = useState<PaperKey>("A4");

    // ===== delete state =====
    const [reassignToPresetId, setReassignToPresetId] = useState<Id | null>(null);

    // ✅ NEW: per-page reassignment map
    const [reassignMap, setReassignMap] = useState<Record<Id, Id>>({});

    // ===== pages that reference preset =====
    const usedByPages = useMemo(() => {
        if (!presetId) return [];
        return doc.pageOrder.filter((pid) => doc.pagesById[pid]?.presetId === presetId);
    }, [presetId, doc.pageOrder, doc.pagesById]);

    // ===== init when open / mode changes =====
    useEffect(() => {
        if (!open) return;

        setNameTouched(false);

        if (presetMode === "create") {
            setCloneFromId(initialCloneFromId ?? CLONE_A4);
            setOri("portrait");
            setPaperKey("A4");
            setName(isBootstrap ? "A4 Portrait" : `Preset ${doc.pagePresetOrder.length + 1}`);
            setReassignToPresetId(null);
            return;
        }


        if ((presetMode === "edit" || presetMode === "delete") && targetPreset) {
            const baseOri: "portrait" | "landscape" =
                targetPreset.size.width > targetPreset.size.height ? "landscape" : "portrait";

            setOri(baseOri);
            setName(targetPreset.name ?? "Untitled preset");

            // ✅ derive paperKey จาก size ของ preset
            setPaperKey(guessPaperKeyFromSize(targetPreset.size.width, targetPreset.size.height));

            if (presetMode === "delete") {
                const fallback = presetOptions.find((p) => p.id !== targetPreset.id)?.id ?? null;
                setReassignToPresetId(fallback);

                // ✅ init map ให้ทุกหน้าที่ใช้ preset นี้ -> fallback (ถ้ามี)
                const next: Record<Id, Id> = {};
                if (fallback) {
                    for (const pageId of usedByPages) next[pageId] = fallback as Id;
                }
                setReassignMap(next);
            } else {
                setReassignToPresetId(null);
                setReassignMap({});
            }

        }
    }, [open, presetMode, isBootstrap, doc.pagePresetOrder.length, targetPreset, presetOptions, usedByPages]);


    // ===== create: when choose clone preset, suggest name+ori + paperKey (soft) =====
    useEffect(() => {
        if (!open) return;
        if (presetMode !== "create") return;

        if (cloneFromId === CLONE_A4) {
            setPaperKey("A4");
            setOri("portrait");
            if (!nameTouched) setName(isBootstrap ? "A4 Portrait" : `Preset ${doc.pagePresetOrder.length + 1}`);
            return;
        }

        const base = doc.pagePresetsById[cloneFromId];
        if (!base) return;

        const baseOri: "portrait" | "landscape" =
            base.size.width > base.size.height ? "landscape" : "portrait";

        setOri(baseOri);
        setPaperKey(guessPaperKeyFromSize(base.size.width, base.size.height));
        if (!nameTouched) setName(`${base.name} (copy)`);
    }, [cloneFromId, open, presetMode, nameTouched, doc.pagePresetsById, doc.pagePresetOrder.length, isBootstrap]);

    // ===== create: ถ้า user ยังไม่แตะชื่อ ให้ sync ชื่อเบาๆ ตาม paper+ori (soft) =====
    useEffect(() => {
        if (!open) return;
        if (presetMode !== "create") return;
        if (nameTouched) return;

        const p = getPaper(paperKey);
        setName(`${p.name} ${ori === "portrait" ? "Portrait" : "Landscape"}`);
    }, [ori, paperKey, open, presetMode, nameTouched]);

    // ===== styles =====
    const backdrop: React.CSSProperties = {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: 16,
    };

    const card: React.CSSProperties = {
        width: 760,
        maxWidth: "100%",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        fontFamily: "system-ui",
        overflow: "hidden",
    };

    const header: React.CSSProperties = {
        padding: "12px 14px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        gap: 10,
    };

    const body: React.CSSProperties = { padding: 14 };

    const footer: React.CSSProperties = {
        padding: 14,
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
    };

    const btn: React.CSSProperties = {
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: "pointer",
        fontWeight: 700,
    };

    const btnDanger: React.CSSProperties = {
        ...btn,
        borderColor: "#fecaca",
        background: "#fff",
        color: "#991b1b",
    };

    const btnPrimary: React.CSSProperties = {
        ...btn,
        background: "#111827",
        color: "#fff",
        borderColor: "#111827",
    };

    const btnPrimaryDanger: React.CSSProperties = {
        ...btn,
        background: "#b91c1c",
        color: "#fff",
        borderColor: "#b91c1c",
    };

    const input: React.CSSProperties = {
        width: "100%",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        outline: "none",
    };

    const select: React.CSSProperties = {
        width: "100%",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        outline: "none",
        background: "#fff",
    };

    // ===== preview =====
    const paperW = ori === "portrait" ? 150 : 210;
    const paperH = ori === "portrait" ? 210 : 150;

    const paper: React.CSSProperties = {
        width: paperW,
        height: paperH,
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 25px rgba(0,0,0,0.10)",
        position: "relative",
        margin: "0 auto",
    };

    const marginBox: React.CSSProperties = {
        position: "absolute",
        left: 10,
        right: 10,
        top: 10,
        bottom: 10,
        border: "1px dashed #d1d5db",
        borderRadius: 8,
    };

    // ✅ display size: create ใช้ paperKey, edit/delete ใช้ paperKey ด้วย (เดาจาก targetPreset)
    const selectedPaper = getPaper(paperKey);
    const baseW =
        presetMode === "create" ? selectedPaper.w : (targetPreset?.size.width ?? selectedPaper.w);
    const baseH =
        presetMode === "create" ? selectedPaper.h : (targetPreset?.size.height ?? selectedPaper.h);

    // เวลา edit แล้วสลับ ori ให้ preview “หมุน” จาก base ที่เลือก (ไม่ยึด targetBaseOri)
    const displayW = ori === "portrait" ? Math.min(baseW, baseH) : Math.max(baseW, baseH);
    const displayH = ori === "portrait" ? Math.max(baseW, baseH) : Math.min(baseW, baseH);

    const cloneLabel =
        presetMode !== "create"
            ? (targetPreset ? `${targetPreset.name}` : "Preset")
            : (cloneFromId === CLONE_A4
                ? "A4 (default)"
                : (doc.pagePresetsById[cloneFromId]?.name
                    ? `${doc.pagePresetsById[cloneFromId].name} (clone)`
                    : "Preset (clone)"));

    if (!open) return null;

    const title =
        presetMode === "create"
            ? (isBootstrap ? "เริ่มเอกสาร: Add preset" : "Add preset")
            : presetMode === "edit"
                ? "Edit preset"
                : "Delete preset";

    const canClose = !isBootstrap;
    const showCloseX = canClose && presetMode !== "delete";
    const showClone = presetMode === "create";

    const deleteBlockedBecauseOnlyOnePreset = presetOptions.length <= 1;
    const deleteNeedsReassign = usedByPages.length > 0;

    const allPagesReassigned =
        usedByPages.length === 0 ||
        usedByPages.every((pid) => !!reassignMap[pid]);

    const deleteConfirmDisabled =
        deleteBlockedBecauseOnlyOnePreset ||
        isLocked ||
        !allPagesReassigned;


    const editSaveDisabled = !presetId || !name.trim() || isLocked;

    const sizePatchFromPaper = () => {
        const p = getPaper(paperKey);
        const w = ori === "portrait" ? p.w : p.h;
        const h = ori === "portrait" ? p.h : p.w;
        return { width: w, height: h };
    };

    return (
        <div
            style={backdrop}
            onMouseDown={(e) => {
                if (!canClose) return;
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={card} onMouseDown={(e) => e.stopPropagation()}>
                <div style={header}>
                    <div style={{ fontWeight: 900 }}>{title}</div>
                    <div style={{ flex: 1 }} />
                    {showCloseX && (
                        <button style={btn} onClick={onClose}>
                            ✕
                        </button>
                    )}
                </div>

                <div style={body}>
                    {presetMode === "delete" && (
                        <div
                            style={{
                                border: "1px solid #fecaca",
                                background: "#fef2f2",
                                borderRadius: 12,
                                padding: 12,
                                marginBottom: 12,
                                color: "#7f1d1d",
                                lineHeight: 1.4,
                            }}
                        >
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                                ลบ preset: {targetPreset?.name ?? "-"}
                            </div>
                            <div style={{ fontSize: 12 }}>
                                ถ้าหน้าไหนใช้อยู่ ระบบต้อง “ย้ายไป preset อื่น” ก่อนถึงจะลบได้
                            </div>
                            {isLocked && (
                                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800 }}>
                                    preset นี้เป็น system/locked — ลบไม่ได้
                                </div>
                            )}
                        </div>
                    )}

                    {presetMode === "edit" && isLocked && (
                        <div
                            style={{
                                border: "1px solid #fde68a",
                                background: "#fffbeb",
                                borderRadius: 12,
                                padding: 12,
                                marginBottom: 12,
                                color: "#92400e",
                                lineHeight: 1.4,
                                fontSize: 12,
                                fontWeight: 700,
                            }}
                        >
                            preset นี้เป็น system/locked — แก้ชื่อ/ขนาด/หมุนกระดาษไม่ได้ (ใน MVP)
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 14, alignItems: "start" }}>
                        {/* left */}
                        <div style={{ display: "grid", gap: 12 }}>
                            {/*     {showClone && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                        Clone from
                                    </div>
                                    <select
                                        style={select}
                                        value={cloneFromId}
                                        onChange={(e) => setCloneFromId(e.target.value)}
                                    >
                                        <option value={CLONE_A4}>A4 (default)</option>
                                        {presetOptions.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} {p.source === "custom" ? "(custom)" : "(system)"}
                                            </option>
                                        ))}
                                    </select>
                                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", lineHeight: 1.35 }}>
                                        เลือก preset เดิมเพื่อ “copy” มาเป็น preset ใหม่
                                    </div>
                                </div>
                            )} */}

                            {/* ✅ Paper preset */}
                            {(presetMode === "create" || presetMode === "edit") && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                        Paper preset
                                    </div>
                                    <select
                                        style={select}
                                        value={paperKey}
                                        onChange={(e) => setPaperKey(e.target.value as PaperKey)}
                                        disabled={presetMode === "edit" && isLocked}
                                    >
                                        {PAPER_PRESETS.map((p) => (
                                            <option key={p.key} value={p.key}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", lineHeight: 1.35 }}>
                                        เลือกขนาดกระดาษก่อน แล้วค่อยหมุน Orientation
                                    </div>
                                </div>
                            )}

                            {/* name */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                    Preset name
                                </div>
                                <input
                                    style={input}
                                    value={name}
                                    onChange={(e) => {
                                        setNameTouched(true);
                                        setName(e.target.value);
                                    }}
                                    disabled={presetMode !== "create" && isLocked}
                                />
                            </div>

                            {/* size */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                    Page size
                                </div>
                                <div style={{ fontWeight: 700, color: "#111827" }}>{cloneLabel}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    {displayW} × {displayH} px (ประมาณ)
                                </div>
                            </div>

                            {/* orientation */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                    Orientation
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        type="button"
                                        style={{ ...btn, borderColor: ori === "portrait" ? "#111827" : "#e5e7eb" }}
                                        onClick={() => setOri("portrait")}
                                        disabled={presetMode !== "create" && isLocked}
                                    >
                                        Portrait
                                    </button>
                                    <button
                                        type="button"
                                        style={{ ...btn, borderColor: ori === "landscape" ? "#111827" : "#e5e7eb" }}
                                        onClick={() => setOri("landscape")}
                                        disabled={presetMode !== "create" && isLocked}
                                    >
                                        Landscape
                                    </button>
                                </div>
                            </div>

                            {/* delete mode: reassign */}
                            {presetMode === "delete" && (
                                <div style={{ display: "grid", gap: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#374151" }}>
                                        Pages using this preset ({usedByPages.length})
                                    </div>

                                    {/* Apply all */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center" }}>
                                        <select
                                            style={select}
                                            value={reassignToPresetId ?? ""}
                                            onChange={(e) => {
                                                const v = (e.target.value as Id) || null;
                                                setReassignToPresetId(v);

                                                if (v) {
                                                    const next: Record<Id, Id> = {};
                                                    for (const pageId of usedByPages) next[pageId] = v;
                                                    setReassignMap(next);
                                                } else {
                                                    setReassignMap({});
                                                }
                                            }}
                                            disabled={deleteBlockedBecauseOnlyOnePreset || isLocked}
                                        >
                                            <option value="" disabled>
                                                Apply all to...
                                            </option>
                                            {presetOptions
                                                .filter((p) => p.id !== presetId)
                                                .map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} {p.source === "custom" ? "(custom)" : "(system)"}
                                                    </option>
                                                ))}
                                        </select>

                                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                                            เลือกเพื่อ “ย้ายทั้งหมด” แบบเร็วๆ
                                        </div>
                                    </div>

                                    {/* Per-page reassignment list */}
                                    <div
                                        style={{
                                            border: "1px solid #e5e7eb",
                                            borderRadius: 12,
                                            padding: 10,
                                            background: "#fff",
                                            maxHeight: 240,
                                            overflow: "auto",
                                        }}
                                    >
                                        {usedByPages.length === 0 ? (
                                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                                                ไม่มีหน้าใช้อยู่ (ลบได้เลย)
                                            </div>
                                        ) : (
                                            usedByPages.map((pageId) => {
                                                const page = doc.pagesById[pageId];
                                                const val = reassignMap[pageId] ?? "";
                                                return (
                                                    <div
                                                        key={pageId}
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 180px",
                                                            gap: 10,
                                                            alignItems: "center",
                                                            padding: "6px 0",
                                                            borderBottom: "1px solid #f3f4f6",
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 800, fontSize: 12, color: "#111827" }}>
                                                                {page?.name ?? pageId}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: "#6b7280" }}>{pageId}</div>
                                                        </div>

                                                        <select
                                                            style={select}
                                                            value={val}
                                                            onChange={(e) => {
                                                                const v = e.target.value as Id;
                                                                setReassignMap((m) => ({ ...m, [pageId]: v }));
                                                            }}
                                                            disabled={deleteBlockedBecauseOnlyOnePreset || isLocked}
                                                        >
                                                            <option value="" disabled>
                                                                เลือก preset ใหม่…
                                                            </option>
                                                            {presetOptions
                                                                .filter((p) => p.id !== presetId)
                                                                .map((p) => (
                                                                    <option key={p.id} value={p.id}>
                                                                        {p.name} {p.source === "custom" ? "(custom)" : "(system)"}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {deleteBlockedBecauseOnlyOnePreset && (
                                        <div style={{ marginTop: 6, fontSize: 12, color: "#991b1b" }}>
                                            ลบไม่ได้ เพราะเหลือ preset แค่อันเดียว
                                        </div>
                                    )}
                                </div>
                            )}


                            {isBootstrap && presetMode === "create" && (
                                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                                    สร้าง preset แล้วระบบจะสร้างหน้าแรกให้อัตโนมัติ (ปิดหน้านี้ไม่ได้)
                                </div>
                            )}
                        </div>

                        {/* right: preview */}
                        <div
                            style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: 12,
                                padding: 12,
                                background: "#f9fafb",
                            }}
                        >
                            <div style={{ fontSize: 12, fontWeight: 900, color: "#111827", marginBottom: 8 }}>
                                Preview
                            </div>

                            <div style={paper}>
                                <div style={marginBox} />
                                <div
                                    style={{
                                        position: "absolute",
                                        left: 8,
                                        bottom: 6,
                                        fontSize: 10,
                                        color: "#6b7280",
                                        fontWeight: 700,
                                    }}
                                >
                                    margin 10px
                                </div>
                            </div>

                            <div style={{ marginTop: 10, fontSize: 12, color: "#111827", fontWeight: 800 }}>
                                {ori === "portrait" ? "Portrait" : "Landscape"}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                                {displayW} × {displayH} px
                            </div>
                        </div>
                    </div>
                </div>

                <div style={footer}>
                    {/* left actions */}
                    <div style={{ display: "flex", gap: 8 }}>
                        {canClose && (
                            <button style={btn} onClick={onClose}>
                                Cancel
                            </button>
                        )}

                        {/* edit -> request delete */}
                        {/*   {presetMode === "edit" && !isBootstrap && presetId && (
                            <button
                                style={btnDanger}
                                onClick={() => onRequestDelete?.(presetId)}
                                disabled={isLocked}
                                title={isLocked ? "System preset ลบไม่ได้" : "Delete preset"}
                            >
                                Delete…
                            </button>
                        )} */}
                    </div>

                    {/* right primary */}
                    <div style={{ display: "flex", gap: 8 }}>
                        {presetMode === "create" && (
                            <button
                                style={btnPrimary}
                                disabled={!name.trim()}
                                onClick={() =>
                                    onCreate(
                                        { name: name.trim(), orientation: ori, paperKey },
                                        { cloneFromId }
                                    )
                                }
                            >
                                Create preset
                            </button>
                        )}

                        {presetMode === "edit" && (
                            <button
                                style={btnPrimary}
                                disabled={editSaveDisabled}
                                onClick={() => {
                                    if (!presetId) return;

                                    // ✅ ส่ง size ไปด้วย (แทน paperKey) กัน schema เปลี่ยนเยอะ
                                    const nextSize = sizePatchFromPaper();

                                    onUpdate(presetId, {
                                        name: name.trim(),
                                        size: nextSize,
                                        orientation: ori,
                                    });
                                }}
                            >
                                Save
                            </button>
                        )}

                        {presetMode === "delete" && (
                            <button
                                style={btnPrimaryDanger}
                                disabled={!presetId || deleteConfirmDisabled}
                                onClick={() => {
                                    if (!presetId) return;
                                    onDelete(presetId, { reassignMap });
                                }}
                            >
                                Delete preset
                            </button>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
