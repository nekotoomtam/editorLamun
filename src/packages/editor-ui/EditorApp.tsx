"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore, useEditorSessionStore } from "./store/editorStore";
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
    canUndo,
    canRedo,
    undo,
    redo,
}: {
    zoom: number;
    setZoom: (z: number) => void;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
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
            <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
                Undo
            </button>

            <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Y / Shift+Ctrl/Cmd+Z)">
                Redo
            </button>

            <div style={{ width: 1, height: 22, background: "#e5e7eb", margin: "0 4px" }} />
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
        addPageToEnd,
        insertPageAfter,
        deletePage,
        createPagePreset,
        updatePreset,
        deletePresetAndReassignPages,
        canUndo,
        canRedo,
        undo,
        redo,
    } = useEditorStore();

    const { session, setActivePage, setZoom, setEditingTarget } = useEditorSessionStore();
    const activePageId = session.activePageId;
    const zoom = session.zoom;

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

    const [viewingPageId, setViewingPageId] = useState<string | null>(session.activePageId);

    const activePresetId = activePageId ? doc.pagesById[activePageId]?.presetId : null;

    // Undo / Redo keyboard shortcuts
    useEffect(() => {
        const isTypingTarget = (el: EventTarget | null) => {
            if (!(el instanceof HTMLElement)) return false;
            const tag = el.tagName;
            return (
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                el.isContentEditable ||
                // Some custom widgets use role=textbox.
                el.getAttribute("role") === "textbox"
            );
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;

            const isMac = navigator.platform.toLowerCase().includes("mac");
            const mod = isMac ? e.metaKey : e.ctrlKey;
            if (!mod) return;

            const key = e.key.toLowerCase();

            // Undo: Ctrl/Cmd+Z
            if (key === "z" && !e.shiftKey) {
                if (canUndo()) {
                    e.preventDefault();
                    undo();
                }
                return;
            }

            // Redo: Ctrl/Cmd+Y OR Ctrl/Cmd+Shift+Z
            if (key === "y" || (key === "z" && e.shiftKey)) {
                if (canRedo()) {
                    e.preventDefault();
                    redo();
                }
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [canRedo, canUndo, redo, undo]);
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

    function LayerBar({
        value,
        onChange,
    }: {
        value: "page" | "header" | "footer";
        onChange: (v: "page" | "header" | "footer") => void;
    }) {
        const btn = (v: "page" | "header" | "footer", label: string) => {
            const active = value === v;
            return (
                <button
                    key={v}
                    onClick={() => onChange(v)}
                    style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: active ? "#111827" : "#ffffff",
                        color: active ? "#ffffff" : "#111827",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                    }}
                >
                    {label}
                </button>
            );
        };

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
                }}
                title="Editing layer"
            >
                {btn("page", "Page")}
                {btn("header", "Header")}
                {btn("footer", "Footer")}
            </div>
        );
    }

    const viewingRef = useRef<string | null>(viewingPageId);
    useEffect(() => { viewingRef.current = viewingPageId; }, [viewingPageId]);

    const lastSetAtRef = useRef(0);

    const handleViewingChange = (id: string | null) => {
        const now = performance.now();
        if (now - lastSetAtRef.current < 80) return; // throttle
        lastSetAtRef.current = now;

        if (id === viewingRef.current) return;
        setViewingPageId(id);
    };

    useEffect(() => {
        const el = centerRef.current;
        if (!el) return;

        let raf: number | null = null;
        let v = 0;

        // ปรับความช้าได้ตรงนี้
        const WHEEL_GAIN = 0.15;   // ยิ่งต่ำยิ่งช้า (ลอง 0.08 - 0.18)
        const MAX_V = 14;          // จำกัดสปีดสูงสุด (ลอง 10 - 22)
        const FRICTION = 0.88;     // ต้องใกล้ 1 ถึงจะนิ่ม (0.85 - 0.93)

        const isLikelyMouseWheel = (e: WheelEvent) => {
            // trackpad มัก delta เล็กและยิงถี่ ๆ
            const dy = Math.abs(e.deltaY);

            // เมาส์ล้อบนวินโดวส์มักกระโดดเป็นก้อน ๆ ใหญ่ ๆ เช่น 80-120+
            if (dy >= 50) return true;

            // deltaMode=1/2 แทบชัวร์ว่าเป็น wheel แบบ line/page
            if (e.deltaMode !== 0) return true;

            return false;
        };

        const tick = () => {
            raf = null;
            if (Math.abs(v) < 0.1) { v = 0; return; }
            el.scrollTop += v;
            v *= FRICTION;
            raf = requestAnimationFrame(tick);
        };

        const onWheel = (e: WheelEvent) => {
            // ปล่อย trackpad ให้ native จัดการ (จะได้ 1:1, inertial ธรรมชาติ)
            if (!isLikelyMouseWheel(e)) return;

            // จับเฉพาะเมาส์ล้อ: หน่วง + สมูด
            e.preventDefault();

            // แปลง delta ให้เป็น px แบบคงที่พอประมาณ
            // (บน mouse wheel บางตัว deltaY มาเป็น 100 อยู่แล้ว)
            const dyPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;

            v += dyPx * WHEEL_GAIN;
            if (v > MAX_V) v = MAX_V;
            if (v < -MAX_V) v = -MAX_V;

            if (raf == null) raf = requestAnimationFrame(tick);
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", onWheel);
            if (raf != null) cancelAnimationFrame(raf);
        };
    }, []);

    return (

        <div ref={rootRef} style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "#e5e7eb" }}>
                <div ref={centerRef} style={{ height: "100%", overflow: "auto", padding: 16 }}>
                    <CanvasView
                        ref={canvasNavRef}
                        document={doc}
                        mode="scroll"
                        scrollRootRef={centerRef}
                        onAddPageAfter={insertPageAfter}
                        onViewingPageIdChange={handleViewingChange}
                    />

                </div>

                <div style={{ position: "absolute", top: 12, right: rightW + 6 + 12, zIndex: 50 }}>
                    <ZoomBar
                        zoom={zoom}
                        setZoom={setZoom}
                        canUndo={canUndo()}
                        canRedo={canRedo()}
                        undo={undo}
                        redo={redo}
                    />
                    <LayerBar
                        value={session.editingTarget ?? "page"}
                        onChange={setEditingTarget}
                    />

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
                    deletePage={deletePage}
                    leftW={leftW}
                    viewingPageId={viewingPageId}
                    onNavigate={(pageId) => {
                        canvasNavRef.current?.navigateToPage(pageId, { source: "pagesPanel", behavior: "auto" });
                    }}
                    onInsertAfter={(afterId) => {
                        const newId = insertPageAfter(afterId);

                        setViewingPageId(newId);
                        requestAnimationFrame(() => {
                            canvasNavRef.current?.navigateToPage(newId, { source: "pagesPanel", behavior: "auto" });
                        });

                        return newId;
                    }}

                    onAddToEnd={() => {
                        const newId = addPageToEnd();

                        setViewingPageId(newId);
                        requestAnimationFrame(() => {
                            canvasNavRef.current?.navigateToPage(newId, { source: "pagesPanel", behavior: "auto" });
                        });

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
                    const createdPageId = createPagePreset(
                        { name: draft.name, orientation: draft.orientation, paperKey: draft.paperKey },
                        { bootstrap: doc.pageOrder.length === 0 }
                    );

                    setAddPresetOpen(false);

                    // ✅ ถ้าเป็น bootstrap: store จะสร้าง page 1 ให้ แล้วเราพา canvas ไปหน้าใหม่ให้ชัวร์
                    if (createdPageId) {
                        setViewingPageId(createdPageId);
                        requestAnimationFrame(() => {
                            canvasNavRef.current?.navigateToPage(createdPageId, { source: "system", behavior: "auto" });
                        });
                    }

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
                initialCloneFromId={activePresetId ?? undefined}

            />
        </div>
    );
}
