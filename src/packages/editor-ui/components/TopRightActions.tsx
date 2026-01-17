"use client";

import React from "react";

export function TopRightActions({
    canUndo,
    canRedo,
    undo,
    redo,
    onExportPdf,
}: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    onExportPdf: () => void;
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

            <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl/Cmd+Y / Shift+Ctrl/Cmd+Z)"
            >
                Redo
            </button>

            <div style={{ width: 1, height: 22, background: "#e5e7eb", margin: "0 4px" }} />

            <button onClick={onExportPdf}>Export PDF</button>
        </div>
    );
}
