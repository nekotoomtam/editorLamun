import React from "react";

export function PageSlot(props: {
    id: string;
    width: number;
    height: number;
    zoom: number;
    registerRef: (id: string, el: HTMLDivElement | null) => void;
    children: React.ReactNode;
}) {
    const { id, width, height, zoom, registerRef, children } = props;

    return (
        <div
            ref={(el) => registerRef(id, el)}
            style={{
                width: width * zoom,
                height: height * zoom,
                position: "relative",
                margin: "0 auto",
                contain: "layout paint size",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width,
                    height,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    willChange: "transform",
                }}
            >
                {children}
            </div>
        </div>

    );
}
