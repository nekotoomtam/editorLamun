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

    // ✅ preset lookup แบบใหม่
    const presetById = useMemo(() => {
        return doc.pagePresetsById ?? ({} as any);
    }, [doc.pagePresetsById]);

    // ✅ pageId -> index (จาก pageOrder)
    const pageIndexById = useMemo(() => {
        const m = new Map<string, number>();
        const order = doc.pageOrder ?? [];
        order.forEach((id, i) => m.set(id, i));
        return m;
    }, [doc.pageOrder]);

    const getPageNumber = (pageId: string) => {
        const idx = pageIndexById.get(pageId);
        return (idx ?? 0) + 1;
    };

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
                        const pageNo = getPageNumber(p.id);

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
                                <div style={{ fontWeight: 600 }}>{p.name ?? `Page ${pageNo}`}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>#{pageNo}</div>
                            </div>
                        );
                    })
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        {pages.map((p) => {
                            const preset = presetById[p.presetId];
                            const pw = preset?.size?.width ?? 820;
                            const ph = preset?.size?.height ?? 1100;

                            const scale = THUMB_W / pw;
                            const thumbH = Math.round(ph * scale);

                            const active = p.id === activePageId;
                            const pageNo = getPageNumber(p.id);

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
                                        <span>{p.name ?? `Page ${pageNo}`}</span>
                                        <span style={{ fontWeight: 700 }}>#{pageNo}</span>
                                    </div>

                                    <div
                                        style={{
                                            width: THUMB_W,
                                            height: thumbH,
                                            margin: "0 auto",
                                            overflow: "hidden",
                                            borderRadius: 10,
                                            background: "#fff",
                                            border: "1px solid rgba(0,0,0,0.08)",
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
                                                renderNodes={false} // ✅ thumbnail ไม่ต้อง render node
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
