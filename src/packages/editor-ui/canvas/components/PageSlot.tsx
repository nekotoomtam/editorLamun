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
            style={{
                width: width * zoom,
                height: height * zoom,
                position: "relative",
                margin: "0 auto",
            }}
            ref={(el) => registerRef(id, el)}
        >
            <div
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    width,
                    height,
                }}
            >
                {children}
            </div>
        </div>
    );
}
