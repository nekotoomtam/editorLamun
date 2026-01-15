import React from "react";
import { GapAdd } from "../../components/GapAdd";

export function GapSlot(props: {
    width: number;
    gapPx: number;
    zoom: number;
    scrollRoot: HTMLElement | null;
    onAdd: () => void;
}) {
    const { width, gapPx, zoom, scrollRoot, onAdd } = props;

    return (
        <div
            style={{
                width: width * zoom,
                height: gapPx * zoom,
                margin: "0 auto",
                position: "relative",
            }}
        >
            <div
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    width,
                    height: gapPx,
                }}
            >
                <GapAdd
                    width={width}
                    scrollRoot={scrollRoot}
                    armDelayMs={200}
                    onAdd={onAdd}
                />
            </div>
        </div>
    );
}
