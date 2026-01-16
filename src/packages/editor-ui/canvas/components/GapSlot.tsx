import React, { useState } from "react";

export function GapSlot(props: {
    width: number;
    gapPx: number;
    zoom: number;
    scrollRoot: HTMLElement | null; // ยังรับไว้ได้ เผื่ออนาคต
    onAdd: () => void;
}) {
    const { width, gapPx, zoom, onAdd } = props;
    const [hover, setHover] = useState(false);

    const w = width * zoom;
    const h = gapPx * zoom;

    return (
        <div
            style={{
                width: w,
                height: h,
                margin: "0 auto",
                position: "relative",
                cursor: hover ? "pointer" : "default",
                userSelect: "none",
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onMouseDown={(e) => {
                // กัน drag selection
                e.preventDefault();
            }}
            onClick={() => onAdd()}
            role="button"
            aria-label="Add page"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onAdd();
            }}
        >
            {/* เส้นกลาง (ไม่เปลี่ยน layout) */}
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "50%",
                    height: 1,
                    transform: "translateY(-0.5px)",
                    background: hover ? "rgba(59,130,246,0.55)" : "rgba(17,24,39,0.12)",
                    pointerEvents: "none",
                }}
            />

            {/* ปุ่ม + กลางช่อง */}
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: hover ? "rgba(59,130,246,0.10)" : "rgba(255,255,255,0.9)",
                    border: `1px solid ${hover ? "rgba(59,130,246,0.55)" : "rgba(17,24,39,0.18)"}`,
                    boxShadow: hover ? "0 6px 16px rgba(0,0,0,0.08)" : "none",
                    pointerEvents: "none", // คลิกทั้งช่องแทน เพื่อไม่เกิดจุดแปลก
                    opacity: hover ? 1 : 0.35,
                    transition: "opacity 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
                }}
            >
                <div
                    style={{
                        fontSize: 18,
                        lineHeight: "18px",
                        color: hover ? "rgba(59,130,246,0.95)" : "rgba(17,24,39,0.55)",
                        transform: "translateY(-1px)",
                    }}
                >
                    +
                </div>
            </div>

            {/* label จาง ๆ (optional) */}
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(calc(-50% + 22px), -50%)",
                    fontSize: 12,
                    color: hover ? "rgba(59,130,246,0.9)" : "rgba(17,24,39,0.45)",
                    opacity: hover ? 1 : 0,
                    transition: "opacity 120ms ease",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                }}
            >
                Add page
            </div>
        </div>
    );
}
