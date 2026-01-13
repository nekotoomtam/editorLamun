"use client";

import React from "react";
import type { DocumentJson, PageJson } from "../../editor-core/schema";
import { PageView } from "./PageView";

function SkeletonGhostLayer({
    document,
    pageId,
    pageW,
    pageH,
}: {
    document: DocumentJson;
    pageId: string;
    pageW: number;
    pageH: number;
}) {
    const ids = document.nodeOrderByPageId?.[pageId] ?? [];
    const MAX = 80; // กันหน้า node เยอะเกิน
    const slice = ids.slice(0, MAX);

    return (
        <div
            style={{
                position: "relative",
                width: pageW,
                height: pageH,
                borderRadius: 6,
                background: "rgba(255,255,255,0.35)",
                overflow: "hidden",
            }}
        >
            {slice.map((id) => {
                const n: any = document.nodesById?.[id];
                if (!n) return null;

                // ✅ รองรับชื่อ field หลายแบบ (กัน schema เปลี่ยน)
                const x = n.x ?? n.rect?.x ?? 0;
                const y = n.y ?? n.rect?.y ?? 0;
                const w = n.width ?? n.w ?? n.rect?.width ?? 60;
                const h = n.height ?? n.h ?? n.rect?.height ?? 18;

                // clamp กันหลุดหน้า
                const cx = Math.max(0, x);
                const cy = Math.max(0, y);
                const cw = Math.max(6, Math.min(w, pageW - cx));
                const ch = Math.max(6, Math.min(h, pageH - cy));

                return (
                    <div
                        key={id}
                        style={{
                            position: "absolute",
                            left: x,
                            top: y,
                            width: cw,
                            height: ch,
                            borderRadius: 4,
                            border: "1px solid rgba(0,0,0,0.10)",
                            background: "rgba(0,0,0,0.03)",
                        }}
                    />
                );
            })}

            {/* shimmer เบา ๆ */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                        "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.2s linear infinite",
                    opacity: 0.35,
                }}
            />
        </div>
    );
}


export function VirtualPage(props: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    level: "full" | "skeleton" | "none";
    onActivate?: () => void;
    loading?: boolean;
}) {
    const { document, page, showMargin, active, level, onActivate, loading } = props;

    const preset = document.pagePresetsById?.[page.presetId] ?? null;
    const pageH = preset?.size?.height ?? 1100;
    const pageW = preset?.size?.width ?? 820;

    // ✅ none = placeholder กินพื้นที่เท่าหน้าจริง
    if (level === "none") {
        return <div data-page-id={page.id} style={{ width: pageW, height: pageH }} />;
    }

    // ✅ skeleton = โครงหน้า (ตอนนี้ทำเป็นกรอบง่าย ๆ ไปก่อน)
    if (level === "skeleton") {
        return (
            <div data-page-id={page.id} onMouseDown={onActivate}>
                <SkeletonGhostLayer
                    document={document}
                    pageId={page.id}
                    pageW={pageW}
                    pageH={pageH}
                />
            </div>
        );
    }

    // ✅ full = render จริง
    return (
        <div data-page-id={page.id}>
            <PageView
                document={document}
                page={page}
                showMargin={showMargin}
                active={active}
                onActivate={onActivate}
                loading={loading}
                renderNodes={true}
                thumbPreview={false} // ✅ full ไม่ควรเป็น thumb
            />
        </div>
    );
}

