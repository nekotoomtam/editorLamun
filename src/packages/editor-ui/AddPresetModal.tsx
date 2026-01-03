"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { DocumentJson, PagePreset } from "../editor-core/schema";
import { normalizePresetOrientation } from "../editor-core/schema";

type Draft = {
    name: string;
    orientation: "portrait" | "landscape";
};

export function AddPresetModal({
    open,
    doc,
    mode, // "bootstrap" | "library"
    onClose,
    onConfirm,
}: {
    open: boolean;
    doc: DocumentJson;
    mode: "bootstrap" | "library";
    onClose: () => void;
    onConfirm: (draft: Draft) => void;
}) {
    const isBootstrap = mode === "bootstrap";

    // A4 base (MVP fixed)
    const A4 = useMemo(() => ({ width: 820, height: 1160 }), []);

    const [name, setName] = useState("A4 Portrait");
    const [ori, setOri] = useState<"portrait" | "landscape">("portrait");

    // ✅ dropdown: clone from preset
    const CLONE_A4 = "__A4__";
    const presetOptions = useMemo(() => {
        return doc.pagePresetOrder
            .map((id) => doc.pagePresetsById[id])
            .filter((p): p is PagePreset => Boolean(p));
    }, [doc.pagePresetOrder, doc.pagePresetsById]);

    const [cloneFromId, setCloneFromId] = useState<string>(CLONE_A4);

    // ✅ UX: ถ้าผู้ใช้พิมพ์ชื่อเองแล้ว อย่า auto ทับชื่อ
    const [nameTouched, setNameTouched] = useState(false);

    useEffect(() => {
        if (!open) return;

        // default ทุกครั้งที่เปิด
        setNameTouched(false);
        setCloneFromId(CLONE_A4);

        setOri("portrait");
        setName(isBootstrap ? "A4 Portrait" : `Preset ${doc.pagePresetOrder.length + 1}`);
    }, [open, isBootstrap, doc.pagePresetOrder.length]);

    // ✅ เมื่อเลือก clone preset: เติม orientation + ชื่อ (ถ้ายังไม่แก้ชื่อเอง)
    useEffect(() => {
        if (!open) return;

        if (cloneFromId === CLONE_A4) {
            // กลับมาใช้ default A4
            setOri("portrait");
            if (!nameTouched) setName(isBootstrap ? "A4 Portrait" : `Preset ${doc.pagePresetOrder.length + 1}`);
            return;
        }

        const base = doc.pagePresetsById[cloneFromId];
        if (!base) return;

        const baseOri: "portrait" | "landscape" =
            base.size.width > base.size.height ? "landscape" : "portrait";

        setOri(baseOri);
        if (!nameTouched) setName(`${base.name} (copy)`);
    }, [cloneFromId, open, nameTouched, doc.pagePresetsById, doc.pagePresetOrder.length, isBootstrap]);

    // ✅ เมื่อเปลี่ยน orientation: ถ้ายังไม่แก้ชื่อเอง ให้ sync ชื่อแบบเบาๆ (เฉพาะกรณีเลือก A4)
    useEffect(() => {
        if (!open) return;
        if (nameTouched) return;
        if (cloneFromId !== CLONE_A4) return; // ถ้า clone preset อย่าไปทับชื่อมันแรงเกิน

        setName(ori === "portrait" ? (isBootstrap ? "A4 Portrait" : "A4 Portrait") : "A4 Landscape");
    }, [ori, open, nameTouched, cloneFromId, isBootstrap]);



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
        width: 720, // ✅ กว้างขึ้นเพื่อใส่ preview
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
        justifyContent: "flex-end",
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

    const btnPrimary: React.CSSProperties = {
        ...btn,
        background: "#111827",
        color: "#fff",
        borderColor: "#111827",
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

    // ===== Preview paper (simple) =====
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

    // แสดงขนาดตาม orientation (MVP fixed A4)
    const displayW = ori === "portrait" ? A4.width : A4.height;
    const displayH = ori === "portrait" ? A4.height : A4.width;

    // ถ้า cloneFrom เป็น preset จริง ให้ใช้ชื่อมันเป็น label บน preview ด้วย
    const cloneLabel =
        cloneFromId === CLONE_A4
            ? "A4 (fixed in MVP)"
            : (doc.pagePresetsById[cloneFromId]?.name
                ? `${doc.pagePresetsById[cloneFromId].name} (clone)`
                : "Preset (clone)");

    if (!open) return null;

    return (
        <div
            style={backdrop}
            onMouseDown={(e) => {
                // bootstrap: ปิดไม่ได้
                if (isBootstrap) return;
                // library: คลิกฉากหลังปิดได้
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={card} onMouseDown={(e) => e.stopPropagation()}>
                <div style={header}>
                    <div style={{ fontWeight: 900 }}>
                        {isBootstrap ? "เริ่มเอกสาร: Add preset" : "Add preset"}
                    </div>
                    <div style={{ flex: 1 }} />
                    {!isBootstrap && (
                        <button style={btn} onClick={onClose}>
                            ✕
                        </button>
                    )}
                </div>

                <div style={body}>
                    {/* ✅ 2 column: form + preview */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 14, alignItems: "start" }}>
                        {/* left: form */}
                        <div style={{ display: "grid", gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                    Clone from
                                </div>
                                <select
                                    style={select}
                                    value={cloneFromId}
                                    onChange={(e) => {
                                        setCloneFromId(e.target.value);
                                    }}
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
                                />
                            </div>

                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                    Page size
                                </div>
                                <div style={{ fontWeight: 700, color: "#111827" }}>{cloneLabel}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    {displayW} × {displayH} px (ประมาณ)
                                </div>
                            </div>

                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
                                    Orientation
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        style={{ ...btn, borderColor: ori === "portrait" ? "#111827" : "#e5e7eb" }}
                                        onClick={() => setOri("portrait")}
                                    >
                                        Portrait
                                    </button>
                                    <button
                                        style={{ ...btn, borderColor: ori === "landscape" ? "#111827" : "#e5e7eb" }}
                                        onClick={() => setOri("landscape")}
                                    >
                                        Landscape
                                    </button>
                                </div>
                            </div>

                            {isBootstrap && (
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
                    {!isBootstrap && (
                        <button style={btn} onClick={onClose}>
                            Cancel
                        </button>
                    )}
                    <button
                        style={btnPrimary}
                        disabled={!name.trim()}
                        onClick={() => onConfirm({ name: name.trim(), orientation: ori })}
                    >
                        Create preset
                    </button>
                </div>
            </div>
        </div>
    );
}
