import React, { useLayoutEffect, useRef, useState } from "react";

export default function CollapsibleSection({
    title,
    open,
    onToggle,
    right,
    children,
}: {
    title: string;
    open: boolean;
    onToggle: () => void;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [h, setH] = useState(0);

    useLayoutEffect(() => {
        const el = innerRef.current;
        if (!el) return;

        const measure = () => setH(el.scrollHeight);

        measure();

        // เผื่อ content เปลี่ยนสูงในอนาคต (fail-soft if ResizeObserver unavailable)
        let ro: ResizeObserver | null = null;
        try {
            if (typeof ResizeObserver !== "undefined") {
                ro = new ResizeObserver(measure);
                ro.observe(el);
            }
        } catch {
            ro = null;
        }
        return () => {
            try {
                ro?.disconnect();
            } catch { }
        };
    }, [children]);

    return (
        <div
            style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                background: "#fff",
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    color: '#000'
                }}
            >
                <div style={{ fontWeight: 900 }}>{title}</div>
                <div style={{ flex: 1 }} />
                {right}
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        display: "grid",
                        placeItems: "center",
                        background: "#fff",
                        fontWeight: 900,
                        lineHeight: 1,
                    }}
                    aria-hidden
                >
                    {open ? "▾" : "▸"}
                </div>
            </button>

            <div
                style={{
                    overflow: "hidden",
                    height: open ? h + 10 : 0, // +10 เผื่อ marginTop ของ content
                    opacity: open ? 1 : 0,
                    transition: "height 220ms ease, opacity 180ms ease",
                    willChange: "height, opacity",
                }}
            >
                <div ref={innerRef} style={{ marginTop: 10 }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
