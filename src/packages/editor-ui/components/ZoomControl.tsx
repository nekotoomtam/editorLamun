"use client";

import React from "react";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export function ZoomControl({
    zoom,
    setZoom,
    min = 0.25,
    max = 3,
    step = 0.1,
}: {
    zoom: number;
    setZoom: (z: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    const inc = () => setZoom(clamp(Number((zoom + step).toFixed(2)), min, max));
    const dec = () => setZoom(clamp(Number((zoom - step).toFixed(2)), min, max));
    const reset = () => setZoom(1);

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={dec} title="Zoom out">
                -
            </button>

            <div style={{ minWidth: 56, textAlign: "center", fontWeight: 700, fontSize: 12 }}>
                {Math.round(zoom * 100)}%
            </div>

            <button onClick={inc} title="Zoom in">
                +
            </button>

            <button onClick={reset} title="Reset zoom">
                Reset
            </button>
        </div>
    );
}
