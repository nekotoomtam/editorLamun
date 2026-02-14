"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { DocumentJson, PageJson, Id } from "../editor-core/schema";
import { PageView } from "./components/PageView";
import { pt100ToPx } from "./utils/units";

type Mode = "list" | "thumb";
const MODE_KEY = "editor:leftPanelMode";

export function PagesPanel({
    doc,
    pages,
    activePageId,
    viewingPageId,          // ✅ เพิ่ม
    setActivePageId,
    addPageToEnd,

    deletePage,
    leftW,
    onNavigate,
    onInsertAfter,
    onAddToEnd,
}: {
    doc: DocumentJson;
    pages: PageJson[];
    activePageId: string | null;
    viewingPageId: string | null;   // ✅ เพิ่ม
    setActivePageId: (id: string) => void;
    addPageToEnd: () => Id;

    deletePage?: (pageId: Id) => void;
    leftW: number;
    onInsertAfter?: (afterPageId: Id) => Id;
    onAddToEnd?: () => Id;
    onNavigate?: (id: Id) => void;
}) {
    const [mode, setMode] = useState<Mode>("list");
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [hoverId, setHoverId] = useState<string | null>(null);

    const [confirm, setConfirm] = useState<{ pageId: Id; x: number; y: number } | null>(null);


    useEffect(() => {
        if (!confirm) return;

        const onDown = () => setConfirm(null);

        window.addEventListener("pointerdown", onDown);
        return () => window.removeEventListener("pointerdown", onDown);
    }, [confirm]);



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

    const handleAddToEnd = () => {
        const newId = onAddToEnd ? onAddToEnd() : addPageToEnd();

        // เผื่อกรณีบาง flow ยังไม่สั่ง setActive หรือ navigate
        if (newId) {
            setActivePageId(newId);
            onNavigate?.(newId);
        }
    };


    const getPageNumber = (pageId: string) => {
        const idx = pageIndexById.get(pageId);
        return (idx ?? 0) + 1;
    };

    const THUMB_W = Math.max(120, Math.min(200, leftW - 32)); // ปรับตาม panel


    const userInteractingRef = useRef(false);
    const lastUserInteractAtRef = useRef(0);
    const followTimerRef = useRef<number | null>(null);
    const interactTimerRef = useRef<number | null>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const mark = () => {
            userInteractingRef.current = true;
            lastUserInteractAtRef.current = Date.now();

            if (interactTimerRef.current) {
                window.clearTimeout(interactTimerRef.current);
                interactTimerRef.current = null;
            }

            interactTimerRef.current = window.setTimeout(() => {
                if (Date.now() - lastUserInteractAtRef.current > 400) {
                    userInteractingRef.current = false;
                }
                interactTimerRef.current = null;
            }, 450);
        };

        el.addEventListener("wheel", mark, { passive: true });
        el.addEventListener("touchmove", mark, { passive: true });
        el.addEventListener("pointerdown", mark, { passive: true });

        return () => {
            el.removeEventListener("wheel", mark);
            el.removeEventListener("touchmove", mark);
            el.removeEventListener("pointerdown", mark);

            if (interactTimerRef.current) {
                window.clearTimeout(interactTimerRef.current);
                interactTimerRef.current = null;
            }
        };
    }, []);




    useEffect(() => {
        if (!viewingPageId) return;
        const container = scrollRef.current;
        if (!container) return;

        // ถ้า user กำลังเล่น panel อยู่ อย่าไปตาม
        if (userInteractingRef.current) return;

        const el = itemRefs.current[viewingPageId];
        if (!el) return;

        // debounce กันดิ้น
        if (followTimerRef.current) {
            window.clearTimeout(followTimerRef.current);
            followTimerRef.current = null;
        }

        followTimerRef.current = window.setTimeout(() => {
            // follow แบบสุภาพ: ไม่ smooth ตลอด
            el.scrollIntoView({ block: "nearest", behavior: "auto" });
            followTimerRef.current = null;
        }, 100);

        return () => {
            if (followTimerRef.current) {
                window.clearTimeout(followTimerRef.current);
                followTimerRef.current = null;
            }
        };
    }, [viewingPageId, mode]);



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
                    {/*   <button onClick={handleAddToEnd}>+ Add</button>
                    <button onClick={deleteActivePage} disabled={pages.length <= 1}>Delete</button> */}
                </div>
            </div>

            <div ref={scrollRef} className="scrollHover" style={{ flex: 1, overflow: "auto", padding: 8 }}>
                {mode === "list" ? (
                    pages.map((p) => {
                        const viewing = p.id === viewingPageId;
                        const active = p.id === activePageId;
                        const pageNo = getPageNumber(p.id);

                        return (
                            <div
                                key={p.id}
                                ref={(el) => {
                                    itemRefs.current[p.id] = el;
                                }}
                                onClick={() => {
                                    setActivePageId(p.id);       // ยังต้อง set state ใน store (ให้ inspector เปลี่ยน)
                                    onNavigate?.(p.id);        // ✅ สั่ง canvas scroll (ตัวนี้แหละที่ทำให้ “กดซ้ายแล้วไปหน้า”)
                                }}
                                style={{
                                    padding: "8px 10px",

                                    marginBottom: 8,
                                    cursor: "pointer",
                                    background: active ? "#f3f4f6" : viewing ? "rgba(59,130,246,0.08)" : "#fff",
                                    border: active ? "1px solid rgba(59,130,246,0.9)" : "1px solid #e5e7eb",
                                }}
                            >
                                <div style={{ fontWeight: 600 }}>{p.name ?? `Page ${pageNo}`}</div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>#{pageNo}</div>
                            </div>
                        );
                    })
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        {pages.map((p, i) => {
                            const preset = presetById[p.presetId];
                            const pw = preset?.size?.width ?? 82000;
                            const ph = preset?.size?.height ?? 110000;
                            const pwPx = pt100ToPx(pw);
                            const phPx = pt100ToPx(ph);

                            const scale = THUMB_W / pwPx;
                            const thumbH = Math.round(phPx * scale);

                            const viewing = p.id === viewingPageId;
                            const active = p.id === activePageId;
                            const pageNo = getPageNumber(p.id);
                            const isLast = i === pages.length - 1;
                            const showAdd = isLast || hoverId === p.id;
                            return (
                                <div
                                    key={p.id}
                                    onMouseEnter={() => setHoverId(p.id)}
                                    onMouseLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                                >
                                    <div
                                        ref={(el) => {
                                            itemRefs.current[p.id] = el;
                                        }}
                                        onClick={() => {
                                            setActivePageId(p.id);
                                            onNavigate?.(p.id);
                                        }}
                                        style={{
                                            position: "relative",
                                            cursor: "pointer",
                                            background: active ? "#f3f4f6" : viewing ? "rgba(59,130,246,0.08)" : "#fff",
                                            border: active ? "1px solid rgba(59,130,246,0.9)" : "1px solid #e5e7eb",
                                            borderRadius: 10,
                                            padding: 8,
                                        }}
                                    >
                                        {/* 🗑️ delete icon */}
                                        <button
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (pages.length <= 1) return;

                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();

                                                setConfirm((cur) =>
                                                    cur?.pageId === p.id
                                                        ? null
                                                        : {
                                                            pageId: p.id,
                                                            x: r.right, // ✅ ระยะ “ต้องเลื่อนเมาส์ไปขวานิดนึง”
                                                            y: r.top - 10,
                                                        }
                                                );
                                            }}
                                            disabled={pages.length <= 1}
                                            title={pages.length <= 1 ? "ต้องมีอย่างน้อย 1 หน้า" : "ลบหน้านี้"}
                                            style={{
                                                position: "absolute",
                                                top: 8,
                                                right: 8,
                                                width: 26,
                                                height: 26,
                                                borderRadius: 8,
                                                border: "1px solid #e5e7eb",
                                                background: "#fff",
                                                cursor: pages.length <= 1 ? "not-allowed" : "pointer",
                                                opacity: pages.length <= 1 ? 0.4 : 1,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                zIndex: 3,
                                            }}
                                        >
                                            🗑️
                                        </button>


                                        {/* ✅ anchored confirm (no cancel button; click-outside closes) */}
                                        {confirm?.pageId === p.id &&
                                            typeof document !== "undefined" &&
                                            createPortal(
                                                <div
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{
                                                        position: "fixed",
                                                        left: confirm.x,
                                                        top: confirm.y,
                                                        zIndex: 9999,
                                                        background: "#fff",
                                                        border: "1px solid #e5e7eb",
                                                        borderRadius: 10,
                                                        padding: "10px 12px",
                                                        boxShadow: "0 10px 20px rgba(0,0,0,0.08)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 10,
                                                    }}
                                                >
                                                    <span style={{ fontSize: 12, color: "#111827", whiteSpace: "nowrap" }}>
                                                        ลบหน้านี้?
                                                    </span>

                                                    <button
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirm(null);
                                                            deletePage?.(p.id);
                                                        }}
                                                        style={{
                                                            height: 26,
                                                            padding: "0 10px",
                                                            borderRadius: 8,
                                                            border: "1px solid #fecaca",
                                                            background: "#fee2e2",
                                                            cursor: "pointer",
                                                            fontSize: 12,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        ลบ
                                                    </button>
                                                </div>,
                                                document.body
                                            )}


                                        {/* header */}
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: "#6b7280",
                                                marginBottom: 6,
                                                display: "flex",
                                                justifyContent: "space-between",
                                                paddingRight: 28, // กันชนกับปุ่มถังขยะ
                                            }}
                                        >
                                            <span>{p.name ?? `Page ${pageNo}`}</span>
                                            <span style={{ fontWeight: 700 }}>#{pageNo}</span>
                                        </div>

                                        {/* thumb */}
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
                                                    width: pwPx,
                                                    height: phPx,
                                                    transform: `scale(${scale})`,
                                                    transformOrigin: "top left",
                                                }}
                                            >
                                                <PageView
                                                    document={doc}
                                                    page={p}
                                                    showMargin={false}
                                                    active={false}
                                                    renderNodes={false}
                                                    zoom={scale}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {showAdd && (
                                        <div
                                            onClick={(e) => {
                                                if (!showAdd) return;
                                                e.stopPropagation();
                                                const newId = onInsertAfter?.(p.id);
                                                if (newId) onNavigate?.(newId);
                                            }}
                                            style={{
                                                height: 22,
                                                border: "1px dashed #e5e7eb",
                                                borderRadius: 10,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                cursor: showAdd ? "pointer" : "default",
                                                color: "#94a3b8",
                                                fontSize: 12,

                                                opacity: showAdd ? 1 : 0,
                                                transform: showAdd ? "translateY(0)" : "translateY(-6px)",
                                                transition: showAdd
                                                    ? "opacity 180ms ease 60ms, transform 180ms ease 60ms"
                                                    : "opacity 120ms ease, transform 120ms ease",
                                                pointerEvents: showAdd ? "auto" : "none",

                                                marginTop: 6,
                                                marginBottom: isLast ? 14 : 0,
                                            }}
                                        >
                                            + Add page
                                        </div>

                                    )}
                                </div>
                            );
                        })}
                    </div>

                )}
            </div>
        </div>
    );
}
