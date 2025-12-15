"use client";
import React from "react";

export function GapAdd({ onAdd, width = 820 }: { onAdd: () => void; width?: number }) {
    const [hover, setHover] = React.useState(false);

    return (
        <div
            data-gap="1"
            onClick={onAdd}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                height: hover ? 72 : 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                userSelect: "none",
                transition: "height 120ms ease",
            }}
        >
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: width,
                    margin: "0 auto",
                    height: hover ? 56 : 8,
                    transition: "height 120ms ease",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: 2,
                        background: "rgba(0,0,0,0.15)",
                        opacity: hover ? 0 : 1,
                        transition: "opacity 120ms ease",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        border: hover ? "2px dashed rgba(0,0,0,0.25)" : "2px dashed rgba(0,0,0,0)",
                        borderRadius: 10,
                        transition: "border-color 120ms ease",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: hover ? 32 : 26,
                        height: hover ? 32 : 26,
                        borderRadius: 999,
                        border: "1px solid rgba(0,0,0,0.18)",
                        background: "rgba(255,255,255,0.95)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        boxShadow: hover ? "0 10px 22px rgba(0,0,0,0.14)" : "0 6px 14px rgba(0,0,0,0.10)",
                        transition: "all 120ms ease",
                    }}
                >
                    +
                </div>
            </div>
        </div>
    );
}
