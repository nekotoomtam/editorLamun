import React from "react";

export function PageSlot(props: {
    id: string;
    widthPx: number;
    heightPx: number;
    zoom: number;
    registerRef: (id: string, el: HTMLDivElement | null) => void;
    children: React.ReactNode;
}) {
    const { id, widthPx, heightPx, zoom, registerRef, children } = props;

    return (
        <div
            ref={(el) => registerRef(id, el)}
            style={{
                width: widthPx * zoom,
                height: heightPx * zoom,
                position: "relative",
                margin: "0 auto",
                contain: "layout paint size",
                ...({ ["--zoom" as any]: zoom } as any),
            }}

        >
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: widthPx,
                    height: heightPx,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    willChange: "transform",
                    // Expose zoom to descendants so they can render hairline strokes
                    // that remain ~1 device pixel thick while the page is scaled.
                    ...({ ["--zoom" as any]: zoom } as any),
                }}
            >
                {children}
            </div>
        </div>

    );
}
