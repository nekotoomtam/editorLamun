"use client";

import React from "react";
import type { DocumentJson, PageJson } from "../../editor-core/schema";
import { PageView } from "./PageView";

export function VirtualPage({
    rootEl,
    document,
    page,
    showMargin,
    active,
    onActivate,
    registerRef,
}: {
    rootEl: HTMLElement | null;
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
    registerRef?: (el: HTMLDivElement | null) => void;
}) {
    const [visible, setVisible] = React.useState(false);
    const holderRef = React.useRef<HTMLDivElement | null>(null);

    const preset = document.pagePresets.find((pp) => pp.id === page.presetId) ?? null;

    React.useEffect(() => {
        const el = holderRef.current;
        if (!el) return;

        const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
            root: rootEl,
            rootMargin: "1200px 0px",
            threshold: 0.01,
        });

        obs.observe(el);
        return () => obs.disconnect();
    }, [rootEl]);

    const pageH = preset?.size.height ?? 1100;
    const pageW = preset?.size.width ?? 820;

    return (
        <div
            ref={(el) => {
                holderRef.current = el;
                registerRef?.(el);
            }}
            data-page-id={page.id}
        >
            {visible ? (
                <PageView
                    document={document}
                    page={page}
                    showMargin={showMargin}
                    active={active}
                    onActivate={onActivate}
                />
            ) : (
                <div
                    style={{
                        width: pageW,
                        height: pageH,
                        margin: "0 auto",
                        background: "rgba(255,255,255,0.35)",
                        borderRadius: 6,
                    }}
                />
            )}
        </div>
    );
}
