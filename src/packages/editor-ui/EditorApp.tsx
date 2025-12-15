"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { mockDoc } from "./mockDoc";
import { CanvasView } from "./CanvasView";
import { Inspector } from "./Inspector";
import type { DocumentJson, PageJson } from "../editor-core/schema";

function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortPages(pages: PageJson[]) {
    return pages.slice().sort((a, b) => a.index - b.index);
}

function reindexPages(pages: PageJson[]) {
    return sortPages(pages).map((p, idx) => ({
        ...p,
        index: idx,
        name: p.name ?? `Page ${idx + 1}`,
    }));
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function ZoomBar({
    zoom,
    setZoom,
}: {
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
}) {
    return (
        <div
            style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "rgba(255,255,255,0.9)",
                backdropFilter: "blur(6px)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                fontFamily: "system-ui",
            }}
        >
            <button
                onClick={() =>
                    setZoom((z) => clamp(Number((z - 0.1).toFixed(2)), 0.25, 3))
                }
            >
                -
            </button>

            <div style={{ minWidth: 64, textAlign: "center", fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
            </div>

            <button
                onClick={() =>
                    setZoom((z) => clamp(Number((z + 0.1).toFixed(2)), 0.25, 3))
                }
            >
                +
            </button>

            <button onClick={() => setZoom(1)}>Reset</button>
        </div>
    );
}

export function EditorApp() {
    const [doc, setDoc] = useState<DocumentJson>(mockDoc);
    const centerRef = useRef<HTMLDivElement | null>(null);
    const [activePageId, setActivePageId] = useState<string | null>(
        mockDoc.pages[0]?.id ?? null
    );
    const [zoom, setZoom] = useState(1);

    const pages = useMemo(() => sortPages(doc.pages), [doc.pages]);

    const activePage = useMemo(
        () => pages.find((p) => p.id === activePageId) ?? null,
        [pages, activePageId]
    );
    useEffect(() => {
        const el = centerRef.current;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();

            const step = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom((z) => clamp(Number((z + step).toFixed(2)), 0.25, 3));
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [setZoom]);

    // ====== Page actions ======

    function addPageToEnd() {
        const presetId = doc.pagePresets[0]?.id;
        if (!presetId) return;

        const newPageId = uid("page");

        const newPage: PageJson = {
            id: newPageId,
            presetId,
            index: pages.length,
            name: `Page ${pages.length + 1}`,
            visible: true,
            locked: false,
        };

        const nextPages = reindexPages([...pages, newPage]);
        setDoc((prev) => ({ ...prev, pages: nextPages }));
        setActivePageId(newPageId);
    }

    function insertPageAfter(afterPageId: string) {
        const presetId = doc.pagePresets[0]?.id;
        if (!presetId) return;

        const after = pages.find((p) => p.id === afterPageId);
        if (!after) return;

        const newPageId = uid("page");

        const shifted = pages.map((p) =>
            p.index > after.index ? { ...p, index: p.index + 1 } : p
        );

        const newPage: PageJson = {
            id: newPageId,
            presetId,
            index: after.index + 1,
            name: `Page ${after.index + 2}`,
            visible: true,
            locked: false,
        };

        const nextPages = reindexPages([...shifted, newPage]);
        setDoc((prev) => ({ ...prev, pages: nextPages }));
        setActivePageId(newPageId);
    }

    function deleteActivePage() {
        if (!activePageId) return;
        if (pages.length <= 1) return;

        const removed = pages.filter((p) => p.id !== activePageId);
        const nextPages = reindexPages(removed);

        const nextIndex = Math.min(activePage?.index ?? 0, nextPages.length - 1);
        const nextActive = nextPages[nextIndex];

        setDoc((prev) => ({ ...prev, pages: nextPages }));
        setActivePageId(nextActive?.id ?? null);
    }

    // ====== UI ======

    return (
        <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
            {/* Left: Pages */}
            <div
                style={{
                    width: 240,
                    borderRight: "1px solid #e5e7eb",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 240,
                }}
            >
                {/* left header (ไม่ scroll) */}
                <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ fontWeight: 700 }}>Pages</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button onClick={addPageToEnd}>+ Add</button>
                        <button onClick={deleteActivePage} disabled={pages.length <= 1}>
                            Delete
                        </button>
                    </div>
                </div>

                {/* left body (scroll) */}
                <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
                    {pages.map((p) => {
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
                    })}
                </div>
            </div>

            {/* Center: Canvas */}
            <div style={{ flex: 1, background: "#e5e7eb", position: "relative", overflow: "hidden" }}>
                {/* center scroll container (wheel hook อยู่ตัวนี้) */}
                <div
                    ref={centerRef}
                    style={{
                        height: "100%",
                        overflow: "auto",
                        padding: 16,
                    }}
                >
                    <CanvasView
                        document={{ ...doc, pages }}
                        activePageId={activePageId}
                        showMargin
                        mode="scroll"
                        onAddPageAfter={insertPageAfter}
                        zoom={zoom}
                        setActivePageId={setActivePageId}
                    />
                </div>

                {/* Floating: top-right (ไม่โดน scroll) */}
                <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}>
                    <ZoomBar zoom={zoom} setZoom={setZoom} />
                </div>
            </div>

            {/* Right: Inspector */}
            <div
                style={{
                    width: 320,
                    borderLeft: "1px solid #e5e7eb",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 320,
                }}
            >
                {/* right body (scroll) */}
                <div style={{ flex: 1, overflow: "auto" }}>
                    <Inspector />
                </div>
            </div>
        </div>

    );
}
