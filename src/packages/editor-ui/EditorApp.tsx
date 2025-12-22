"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "./store/editorStore";
import { CanvasView } from "./CanvasView";
import { Inspector } from "./Inspector";
import type { PageJson } from "../editor-core/schema";
import { PagesPanel } from "./PagesPanel";



function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function ZoomBar({
    zoom,
    setZoom,
}: {
    zoom: number;
    setZoom: (z: number) => void
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
                onClick={() => setZoom(clamp(Number((zoom - 0.1).toFixed(2)), 0.25, 3))}
            >
                -
            </button>

            <div style={{ minWidth: 64, textAlign: "center", fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
            </div>

            <button
                onClick={() => setZoom(clamp(Number((zoom + 0.1).toFixed(2)), 0.25, 3))}
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
    const {
        doc, session,
        setActivePage, setZoom,
        addPageToEnd, insertPageAfter, deleteActivePage,
    } = useEditorStore();

    const centerRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const [leftW, setLeftW] = useState(240);
    const [rightW, setRightW] = useState(320);
    const [mounted, setMounted] = useState(false);

    // viewingPageId จะเก็บ local ก็ได้ (หรือจะย้ายเข้า store ทีหลัง)
    const [viewingPageId, setViewingPageId] = useState<string | null>(session.activePageId);

    const activePageId = session.activePageId;
    const zoom = session.zoom;

    useEffect(() => {
        setViewingPageId(session.activePageId);
    }, [session.activePageId]);

    useEffect(() => {
        const el = centerRef.current;
        if (!el) return;

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();

            const step = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom(clamp(Number((zoom + step).toFixed(2)), 0.25, 3));
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [setZoom, zoom]);



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

    // ✅ pages ตามลำดับจริงจาก pageOrder
    const pages = useMemo(() => {
        return doc.pageOrder.map((id) => doc.pagesById[id]).filter(Boolean) as PageJson[];
    }, [doc.pageOrder, doc.pagesById]);




    const draggingLeft = useRef(false);
    const draggingRight = useRef(false);

    useEffect(() => {
        let raf = 0;

        const onMove = (e: MouseEvent) => {
            if (draggingLeft.current) {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    setLeftW(() =>
                        Math.max(MIN_LEFT, Math.min(MAX_LEFT, e.clientX))
                    );
                });
            }

            if (draggingRight.current) {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    const rootW =
                        rootRef.current?.getBoundingClientRect().width ??
                        window.innerWidth;
                    const next = rootW - e.clientX;
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

    // ====== Page actions (schema ใหม่: pageOrder/pagesById) ======

    return (
        <div ref={rootRef} style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "#e5e7eb" }}>
                <div ref={centerRef} style={{ height: "100%", overflow: "auto", padding: 16 }}>
                    <CanvasView
                        document={doc}
                        activePageId={activePageId}
                        setActivePageId={setActivePage}
                        mode="scroll"
                        zoom={zoom}
                        scrollRootRef={centerRef}
                        onAddPageAfter={insertPageAfter}
                        onViewingPageIdChange={setViewingPageId}
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
                <PagesPanel
                    doc={doc}
                    pages={pages}
                    activePageId={activePageId}
                    setActivePageId={setActivePage}
                    addPageToEnd={addPageToEnd}
                    deleteActivePage={deleteActivePage}
                    leftW={leftW}
                    viewingPageId={viewingPageId}
                />
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
                    <Inspector doc={doc} activePageId={activePageId} />
                </div>
            </div>

            {/* Right resizer */}
            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    draggingRight.current = true;
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
