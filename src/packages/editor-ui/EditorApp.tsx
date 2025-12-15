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


const MIN_LEFT = 200;
const MAX_LEFT = 420;
const MIN_RIGHT = 260;
const MAX_RIGHT = 420;
const LEFT_KEY = "editor:leftWidth";
const RIGHT_KEY = "editor:rightWidth";
export function EditorApp() {
    const [doc, setDoc] = useState<DocumentJson>(mockDoc);
    const centerRef = useRef<HTMLDivElement | null>(null);
    const [activePageId, setActivePageId] = useState<string | null>(
        mockDoc.pages[0]?.id ?? null
    );
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [leftW, setLeftW] = useState(240);
    const [rightW, setRightW] = useState(320);
    const [mounted, setMounted] = useState(false);
    const isProgrammaticScrollRef = useRef(false);
    useEffect(() => {
        setMounted(true);

        const lw = Number(localStorage.getItem(LEFT_KEY));
        const rw = Number(localStorage.getItem(RIGHT_KEY));
        if (!Number.isNaN(lw) && lw) setLeftW(lw);
        if (!Number.isNaN(rw) && rw) setRightW(rw);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem(LEFT_KEY, String(leftW));
    }, [leftW, mounted]);

    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem(RIGHT_KEY, String(rightW));
    }, [rightW, mounted]);

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


    const draggingLeft = useRef(false);
    const draggingRight = useRef(false);

    useEffect(() => {
        let raf = 0;

        const onMove = (e: MouseEvent) => {
            if (draggingLeft.current) {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    setLeftW((w) =>
                        Math.max(MIN_LEFT, Math.min(MAX_LEFT, e.clientX))
                    );
                });
            }

            if (draggingRight.current) {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    const rootW = rootRef.current?.getBoundingClientRect().width ?? window.innerWidth;
                    const next = rootW - e.clientX; // ความกว้างจากขอบขวาของ root
                    setRightW(Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, next)));
                });
            }
        };

        const onUp = () => {
            draggingLeft.current = false;
            draggingRight.current = false;
            document.body.style.userSelect = "";
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);
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
        <div ref={rootRef} style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
            {/* Center: Canvas (เต็มจอ ไม่โดน push) */}


            <div style={{ position: "absolute", inset: 0, background: "#e5e7eb" }}>
                <div ref={centerRef} style={{ height: "100%", overflow: "auto", padding: 16 }}>
                    <CanvasView
                        document={{ ...doc, pages }}
                        activePageId={activePageId}
                        showMargin
                        mode="scroll"
                        onAddPageAfter={insertPageAfter}
                        zoom={zoom}
                        setActivePageId={setActivePageId}
                        scrollRootRef={centerRef}
                        isProgrammaticScrollRef={isProgrammaticScrollRef}
                        onActivePageChangeFromScroll={(pid) => {
                            setActivePageId((cur) => (cur === pid ? cur : pid));
                        }}

                    />
                </div>

                <div style={{ position: "absolute", top: 12, right: rightW + 6 + 12, zIndex: 50 }}>
                    <ZoomBar zoom={zoom} setZoom={setZoom} />
                </div>
            </div>

            {/* Left overlay */}
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: leftW,
                    zIndex: 60,
                    background: "#fff",
                    borderRight: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ fontWeight: 700 }}>Pages</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button onClick={addPageToEnd}>+ Add</button>
                        <button onClick={deleteActivePage} disabled={pages.length <= 1}>Delete</button>
                    </div>
                </div>

                {/* left body (scroll) */}
                <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
                    {pages.map((p) => {
                        const active = p.id === activePageId;
                        return (
                            <div
                                key={p.id}
                                onClick={() => {
                                    isProgrammaticScrollRef.current = true;
                                    setActivePageId(p.id);
                                    setTimeout(() => (isProgrammaticScrollRef.current = false), 450);
                                }}
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

            {/* Left resizer */}
            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    draggingLeft.current = true;
                    document.body.style.userSelect = "none";
                }}
                style={{
                    position: "absolute",
                    left: leftW - 3,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    cursor: "col-resize",
                    zIndex: 70,
                }}
            />

            {/* Right overlay */}
            <div
                style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: rightW,
                    zIndex: 60,
                    background: "#fff",
                    borderLeft: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div style={{ flex: 1, overflow: "auto" }}>
                    <Inspector />
                </div>
            </div>

            {/* Right resizer */}
            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    draggingRight.current = true; // ✅ จุดนี้สำคัญ
                    document.body.style.userSelect = "none";
                }}
                style={{
                    position: "absolute",
                    right: rightW - 3,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    cursor: "col-resize",
                    zIndex: 70,
                }}
            />
        </div>
    );


}
