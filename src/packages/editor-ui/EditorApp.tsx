"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "./store/editorStore";
import { CanvasView } from "./CanvasView";
import { Inspector } from "./Inspector";
import type { PageJson } from "../editor-core/schema";
import { PagesPanel } from "./PagesPanel";
import type { CanvasNavigatorHandle } from "./CanvasView";
import { AddPresetModal } from "./AddPresetModal";
import type { Id } from "../editor-core/schema";


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

const MIN_LEFT = 260;
const MAX_LEFT = 420;
const MIN_RIGHT = 270;
const MAX_RIGHT = 420;
const LEFT_KEY = "editor:leftWidth";
const RIGHT_KEY = "editor:rightWidth";

export function EditorApp() {
    const {
        doc,
        session,
        setActivePage,
        setZoom,
        addPageToEnd,
        insertPageAfter,
        deleteActivePage,
        createPagePreset,
        updatePreset,
        deletePresetAndReassignPages,
    } = useEditorStore();


    const canvasNavRef = useRef<CanvasNavigatorHandle | null>(null);
    const centerRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const [leftW, setLeftW] = useState(240);
    const [rightW, setRightW] = useState(320);
    const [mounted, setMounted] = useState(false);
    const [addPresetOpen, setAddPresetOpen] = useState(false);

    // ✅ NEW: preset modal state
    const [presetMode, setPresetMode] = useState<"create" | "edit" | "delete">("create");
    const [presetId, setPresetId] = useState<Id | null>(null);

    const addPresetMode = doc.pageOrder.length === 0 ? "bootstrap" : "library";

    // viewingPageId จะเก็บ local ก็ได้ (หรือจะย้ายเข้า store ทีหลัง)
    const [viewingPageId, setViewingPageId] = useState<string | null>(session.activePageId);

    const activePageId = session.activePageId;
    const zoom = session.zoom;

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

    const didAutoOpenPresetRef = useRef(false);

    useEffect(() => {
        const empty = doc.pageOrder.length === 0;

        if (empty && !didAutoOpenPresetRef.current) {
            didAutoOpenPresetRef.current = true;
            setPresetMode("create");
            setPresetId(null);
            setAddPresetOpen(true);

            // เอาออกก่อน ลด loop:
            // setActivePage(null);
            return;
        }

        if (!empty) {
            didAutoOpenPresetRef.current = false; // กลับมามีหน้าแล้ว reset เผื่ออนาคตลบจนเหลือ 0
        }
    }, [doc.pageOrder.length]); // ตัด setActivePage ออกจาก deps ไปเลย


    // ✅ helper: open create
    const openCreatePreset = () => {
        setPresetMode("create");
        setPresetId(null);
        setAddPresetOpen(true);
    };

    // ✅ helper: open edit
    const openEditPreset = (id: Id) => {
        setPresetMode("edit");
        setPresetId(id);
        setAddPresetOpen(true);
    };

    // ✅ helper: open delete (มาจาก edit แล้วกด delete)
    const openDeletePreset = (id: Id) => {
        setPresetMode("delete");
        setPresetId(id);
        setAddPresetOpen(true);
    };

    return (
        <div ref={rootRef} style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "#e5e7eb" }}>
                <div ref={centerRef} style={{ height: "100%", overflow: "auto", padding: 16 }}>
                    <CanvasView
                        ref={canvasNavRef}
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
                    onNavigate={(pageId) => {
                        canvasNavRef.current?.navigateToPage(pageId, { source: "pagesPanel", behavior: "auto" });
                    }}
                    onInsertAfter={(afterId) => {
                        const newId = insertPageAfter(afterId);
                        canvasNavRef.current?.navigateToPage(newId, { source: "system", behavior: "auto" });
                        return newId;
                    }}
                    onAddToEnd={() => {
                        const newId = addPageToEnd();
                        canvasNavRef.current?.navigateToPage(newId, { source: "system", behavior: "auto" });
                        return newId;
                    }}
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
                    <Inspector
                        doc={doc}
                        activePageId={activePageId}
                        onOpenAddPreset={() => {
                            if (doc.pageOrder.length === 0) return;
                            openCreatePreset();
                        }}
                        onOpenEditPreset={(pid) => {
                            openEditPreset(pid);
                        }}
                    />

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
            <AddPresetModal
                open={addPresetOpen}
                doc={doc}
                mode={addPresetMode}
                presetMode={presetMode}
                presetId={presetId ?? undefined}
                onClose={() => {
                    // bootstrap ปิดไม่ได้อยู่แล้วใน modal
                    setAddPresetOpen(false);
                }}

                // ✅ create
                onCreate={(draft, extra) => {
                    // ตอนนี้ store createPagePreset ยังรับแค่ {name, orientation}
                    // ส่วน cloneFromId ถ้าจะ clone จริง เดี๋ยวค่อยทำ step ต่อ (ตอนนี้ ignore ได้)
                    createPagePreset(
                        { name: draft.name, orientation: draft.orientation, paperKey: draft.paperKey },
                        { bootstrap: doc.pageOrder.length === 0 }
                    );
                    setAddPresetOpen(false);
                }}

                onUpdate={(id, patch) => {
                    updatePreset(id, {
                        name: patch.name,
                        size: patch.size,              // modal ส่งมาแล้ว
                        orientation: patch.orientation,
                    });
                    setAddPresetOpen(false);
                }}

                onDelete={(id, opts) => {
                    deletePresetAndReassignPages(id, { reassignMap: opts.reassignMap });
                    setAddPresetOpen(false);
                }}

                onRequestDelete={(id) => {
                    setPresetMode("delete");
                    setPresetId(id);
                    setAddPresetOpen(true);
                }}
            />
        </div>
    );
}
