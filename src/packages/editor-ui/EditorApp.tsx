"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore, useEditorSessionStore } from "./store/editorStore";
import { CanvasView } from "./CanvasView";
import { RightSidebar } from "./RightSidebar";
import type { PageJson } from "../editor-core/schema";
import { PagesPanel } from "./PagesPanel";
import type { CanvasNavigatorHandle } from "./CanvasView";
import { AddPresetModal } from "./AddPresetModal";
import type { Id } from "../editor-core/schema";
import { computeLayout } from "../editor-renderer/layout/computeLayout";
import { exportProofPdf } from "../editor-renderer/pdf/exportProofPdf";
import { BottomBar, BOTTOM_BAR_HEIGHT } from "./components/BottomBar";
import { TopRightActions } from "./components/TopRightActions";
import type { EditingMode } from "./components/ModeSelector";


function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    return ab;
}

function downloadPdf(bytes: Uint8Array, filename = "proof.pdf") {
    const ab = toArrayBuffer(bytes);
    const blob = new Blob([ab], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            draggingLeft.current = false;
            draggingRight.current = false;
            document.body.style.userSelect = "";
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

    const totalPages = doc.pageOrder.length;
    const currentPageNum = useMemo(() => {
        if (totalPages === 0) return null;
        const id = viewingPageId ?? activePageId;
        if (!id) return null;
        const idx = doc.pageOrder.indexOf(id);
        return idx >= 0 ? idx + 1 : null;
    }, [activePageId, doc.pageOrder, totalPages, viewingPageId]);

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

    const onJumpToPage = (n: number) => {
        if (totalPages === 0) return;
        const clamped = Math.max(1, Math.min(totalPages, n));
        const pageId = doc.pageOrder[clamped - 1];
        if (!pageId) return;

        setViewingPageId(pageId);
        setActivePage(pageId); // ถ้าต้องการให้ active เปลี่ยนด้วย

        requestAnimationFrame(() => {
            canvasNavRef.current?.navigateToPage(pageId, { source: "canvas", behavior: "auto" });

        });
    };

    return (

        <div ref={rootRef} style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "#e5e7eb" }}>
                <div
                    ref={centerRef}
                    style={{
                        height: "100%",
                        overflow: "auto",
                        padding: 16,
                        paddingBottom: 16 + BOTTOM_BAR_HEIGHT,
                    }}
                >
                    <CanvasView
                        ref={canvasNavRef}
                        document={doc}
                        mode="scroll"
                        scrollRootRef={centerRef}
                        onAddPageAfter={insertPageAfter}
                        onViewingPageIdChange={handleViewingChange}
                    />

                </div>

                <div style={{ position: "absolute", top: 12, right: rightW + 6 + 12, zIndex: 70 }}>
                    <TopRightActions
                        canUndo={canUndo()}
                        canRedo={canRedo()}
                        undo={undo}
                        redo={redo}
                        onExportPdf={async () => {
                            try {
                                const layout = computeLayout(doc);
                                const pdfBytes = await exportProofPdf(layout, { debug: true });
                                downloadPdf(pdfBytes, "proof.pdf");
                            } catch (err) {
                                console.error("Export PDF failed", err);
                                alert("Export PDF failed (ดู console)");
                            }
                        }}
                    />
                </div>
            </div>

            <BottomBar
                mode={(session.editingTarget ?? "page") as EditingMode}
                onChangeMode={(m) => setEditingTarget(m)}
                zoom={zoom}
                setZoom={setZoom}
                currentPage={currentPageNum}
                totalPages={totalPages}
                onJumpToPage={onJumpToPage}
                leftOffset={leftW}
                rightOffset={rightW}

            />

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
                <RightSidebar
                    doc={doc}
                    onOpenAddPreset={() => {
                        if (doc.pageOrder.length === 0) return;
                        openCreatePreset();
                    }}
                />
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
