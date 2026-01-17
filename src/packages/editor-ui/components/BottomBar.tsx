"use client";

import React from "react";
import { ModeSelector, type EditingMode } from "./ModeSelector";
import { ZoomControl } from "./ZoomControl";

export const BOTTOM_BAR_HEIGHT = 52;

export function BottomBar({
    leftOffset = 0,
    rightOffset = 0,
    mode,
    onChangeMode,
    zoom,
    setZoom,
    currentPage,
    totalPages,
    onJumpToPage,
}: {
    leftOffset?: number;
    rightOffset?: number;
    mode: EditingMode;
    onChangeMode: (m: EditingMode) => void;
    zoom: number;
    setZoom: (z: number) => void;
    currentPage: number | null; // 1-based
    totalPages: number;
    onJumpToPage: (n: number) => void;
}) {
    const [pageText, setPageText] = React.useState("");

    React.useEffect(() => {
        if (currentPage == null) return;
        setPageText(String(currentPage));
    }, [currentPage]);
    return (
        <div
            style={{
                position: "absolute",
                left: leftOffset,
                right: rightOffset,
                bottom: 0,
                height: BOTTOM_BAR_HEIGHT,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 12,
                borderTop: "1px solid #e5e7eb",
                background: "rgba(255,255,255,0.9)",
                backdropFilter: "blur(6px)",
                zIndex: 80,
                fontFamily: "system-ui",
            }}
        >
            <ModeSelector value={mode} onChange={onChangeMode} />

            <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />

            <ZoomControl zoom={zoom} setZoom={setZoom} />

            <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />

            <div
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#111827",
                    minWidth: 90,
                }}
                title="Current page / total pages"
            >
                {totalPages === 0 ? (
                    <div style={{ fontSize: 12, fontWeight: 700 }}>No pages</div>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                        <span>Page</span>
                        <input
                            value={pageText}
                            onChange={(e) => setPageText(e.target.value.replace(/[^\d]/g, ""))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    const n = Number(pageText || "0");
                                    if (Number.isFinite(n) && n > 0) onJumpToPage(n);
                                    (e.currentTarget as HTMLInputElement).blur();
                                }
                            }}
                            onBlur={() => {
                                const n = Number(pageText || "0");
                                if (Number.isFinite(n) && n > 0) onJumpToPage(n);
                            }}
                            style={{ width: 44, height: 24, padding: "0 6px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                            inputMode="numeric"
                        />
                        <span>/ {totalPages}</span>
                    </div>
                )}
            </div>

            {/* spacer: keep everything left-aligned as requested */}
            <div style={{ flex: 1 }} />
        </div>
    );
}
