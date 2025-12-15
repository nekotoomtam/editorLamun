"use client";

import React, { useMemo, useEffect, useState } from "react";
import type { DocumentJson, PageJson } from "../editor-core/schema";
import { PageView } from "./components/PageView";

type Mode = "list" | "thumb";
const MODE_KEY = "editor:leftPanelMode";

export function PagesPanel({
    doc,
    pages,
    activePageId,
    setActivePageId,
    addPageToEnd,
    deleteActivePage,
    leftW,
}: {
    doc: DocumentJson;
    pages: PageJson[];
    activePageId: string | null;
    setActivePageId: (id: string) => void;
    addPageToEnd: () => void;
    deleteActivePage: () => void;
    leftW: number;
}) {
    const [mode, setMode] = useState<Mode>("list");

    useEffect(() => {
        const m = (localStorage.getItem(MODE_KEY) as Mode) || "list";
        if (m === "list" || m === "thumb") setMode(m);
    }, []);

    useEffect(() => {
        localStorage.setItem(MODE_KEY, mode);
    }, [mode]);

    const presetById = useMemo(() => {
        const m = new Map(doc.pagePresets.map(p => [p.id, p]));
        return m;
    }, [doc.pagePresets]);

    const THUMB_W = Math.max(120, Math.min(200, leftW - 32)); // ปรับตาม panel

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Pages</span>

                    <div style={{ display: "flex", gap: 6 }}>
                        <button
                            onClick={() => setMode("list")}
                            style={{ fontWeight: mode === "list" ? 700 : 400 }}
                        >
                            List
                        </button>
                        <button
                            onClick={() => setMode("thumb")}
                            style={{ fontWeight: mode === "thumb" ? 700 : 400 }}
                        >
                            Thumbs
                        </button>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={addPageToEnd}>+ Add</button>
                    <button onClick={deleteActivePage} disabled={pages.length <= 1}>Delete</button>
                </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
                {mode === "list" ? (
                    pages.map((p) => {
                        const active = p.id === activePageId;
                        return (
                            <div
                                key={p.id}
                                onClick={() => setActivePageId(p.id)}
                                style={{
                                    padding: "8px 10px",
                                    border: "1px solid #e5e7eb",
                                    marginBottom: 8,
                                    cursor: "pointer",
                                    background: active ? "#f3f4f6" : "#fff",
                                }}
                            >
                                <div style={{ fontWeight: 600 }}>{p.name ?? `Page ${p.index + 1}`}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>index: {p.index}</div>
                            </div>
                        );
                    })
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        {pages.map((p) => {
                            const preset = presetById.get(p.presetId);
                            const pw = preset?.size.width ?? 820;
                            const ph = preset?.size.height ?? 1100;

                            const scale = THUMB_W / pw;
                            const thumbH = Math.round(ph * scale);

                            const active = p.id === activePageId;

                            return (
                                <div
                                    key={p.id}
                                    onClick={() => setActivePageId(p.id)}
                                    style={{
                                        cursor: "pointer",
                                        border: active ? "2px solid rgba(59,130,246,0.9)" : "1px solid #e5e7eb",
                                        borderRadius: 10,
                                        padding: 8,
                                        background: "#fff",
                                    }}
                                >
                                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                                        <span>{p.name ?? `Page ${p.index + 1}`}</span>
                                        <span style={{ fontWeight: 700 }}>#{p.index + 1}</span>
                                    </div>

                                    <div
                                        style={{
                                            width: THUMB_W,
                                            height: thumbH,
                                            margin: "0 auto",
                                            overflow: "hidden",
                                            borderRadius: 10,
                                            background: "#fff",
                                            border: "1px solid rgba(0,0,0,0.08)", // ✅ เพิ่ม
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: pw,
                                                height: ph,
                                                transform: `scale(${scale})`,
                                                transformOrigin: "top left",
                                            }}
                                        >
                                            <PageView
                                                document={doc}
                                                page={p}
                                                showMargin={false}
                                                active={false}
                                                renderNodes={false}  // ✅ thumbnail ไม่ต้อง render node
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
