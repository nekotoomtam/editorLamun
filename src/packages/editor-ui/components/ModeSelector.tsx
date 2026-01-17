"use client";

import React from "react";

export type EditingMode = "page" | "header" | "footer";

export function ModeSelector({
    value,
    onChange,
}: {
    value: EditingMode;
    onChange: (v: EditingMode) => void;
}) {
    const btn = (v: EditingMode, label: string) => {
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
                    fontWeight: 700,
                }}
                title={`Editing: ${label}`}
            >
                {label}
            </button>
        );
    };

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {btn("page", "Page")}
            {btn("header", "Header")}
            {btn("footer", "Footer")}
        </div>
    );
}
