"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { DocumentJson, PageJson, PagePreset, NodeJson, AssetImage } from "../editor-core/schema";

type CanvasMode = "single" | "scroll";
type ImageFit = "contain" | "cover" | "stretch";

const fitMap: Record<ImageFit, React.CSSProperties["objectFit"]> = {
    contain: "contain",
    cover: "cover",
    stretch: "fill", // editor concept -> CSS value
};

export function CanvasView({
    document,
    activePageId,
    showMargin = false,
    mode = "single",
    onAddPageAfter,
    zoom = 1,
    setActivePageId,
    scrollRootRef,
    onActivePageChangeFromScroll,
    isProgrammaticScrollRef,
}: {
    document: DocumentJson;
    activePageId: string | null;
    showMargin?: boolean;
    mode?: CanvasMode;
    onAddPageAfter?: (pageId: string) => void;
    zoom?: number;
    setActivePageId?: (pageId: string) => void;
    scrollRootRef?: React.RefObject<HTMLElement | null>;
    onActivePageChangeFromScroll?: (pageId: string) => void;
    isProgrammaticScrollRef?: React.RefObject<boolean>;
}) {
    const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const seen = useRef<Record<string, IntersectionObserverEntry>>({});
    const rafPick = useRef<number | null>(null)
    const activeObsRef = useRef<IntersectionObserver | null>(null);
    const pendingScrollToRef = useRef<string | null>(null);
    const unlockRafRef = useRef<number | null>(null);
    const activeFromScrollRef = useRef(false);
    const lastManualSelectAtRef = useRef(0);

    const markManualSelect = () => {
        lastManualSelectAtRef.current = performance.now();
    };


    const scrollAndLockTo = (target: HTMLElement) => {
        const root = scrollRootRef?.current;
        if (!root) return;

        if (isProgrammaticScrollRef) isProgrammaticScrollRef.current = true;

        // หา offsetTop ของ target ภายใน root
        const rootEl = root as HTMLElement;
        const targetTop = target.offsetTop; // เพราะ target อยู่ใน flow เดียวกันใน root

        rootEl.scrollTo({ top: targetTop, behavior: "smooth" });

        const tolerance = 6;

        const tick = () => {
            const rootNow = scrollRootRef?.current as HTMLElement | null;
            if (!rootNow || !target.isConnected) {
                if (isProgrammaticScrollRef) isProgrammaticScrollRef.current = false;
                return;
            }

            const arrived = Math.abs(rootNow.scrollTop - targetTop) <= tolerance;

            if (arrived) {
                if (isProgrammaticScrollRef) isProgrammaticScrollRef.current = false;
                return;
            }

            unlockRafRef.current = requestAnimationFrame(tick);
        };

        if (unlockRafRef.current) cancelAnimationFrame(unlockRafRef.current);
        unlockRafRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
        if (mode !== "scroll") return;
        if (!activePageId) return;

        // ✅ ถ้าเปลี่ยน active เพราะ user scroll -> ไม่ต้องดูด
        if (activeFromScrollRef.current) {
            activeFromScrollRef.current = false;
            return;
        }

        const el = pageRefs.current[activePageId];
        if (!el) {
            pendingScrollToRef.current = activePageId;
            return;
        }

        scrollAndLockTo(el);

        return () => {
            if (unlockRafRef.current) cancelAnimationFrame(unlockRafRef.current);
            unlockRafRef.current = null;
        };
    }, [activePageId, mode]);

    useEffect(() => {
        if (mode !== "scroll") return;
        const root = scrollRootRef?.current;
        if (!root) return;
        if (!onActivePageChangeFromScroll) return;

        const pickBest = () => {
            rafPick.current = null;

            // ✅ ถ้าเพิ่งคลิกเมื่อกี้ ไม่ต้องให้ scroll มายุ่ง
            if (performance.now() - lastManualSelectAtRef.current < 300) return;

            if (isProgrammaticScrollRef?.current) return;

            const entries = Object.values(seen.current).filter((e) => e.isIntersecting);
            if (entries.length === 0) return;

            const rootEl = scrollRootRef?.current as HTMLElement | null;
            if (!rootEl) return;

            const rootRect = rootEl.getBoundingClientRect();
            const anchorY = rootRect.top + rootRect.height * 0.33;

            // หา best จริงๆ
            let best = entries[0];
            let bestDist = Infinity;

            for (const e of entries) {
                const dist = Math.abs(e.boundingClientRect.top - anchorY);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = e;
                }
            }

            const pageId = (best.target as HTMLElement).dataset.pageId;
            if (!pageId) return;

            // ✅ ถ้าเป็นหน้าเดิม ไม่ต้องยิงซ้ำ (นี่แหละตัวทำให้ “คลิกแล้วเพี้ยน”)
            if (pageId === activePageId) return;

            activeFromScrollRef.current = true;
            onActivePageChangeFromScroll?.(pageId);
        };


        const obs = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const pageId = (e.target as HTMLElement).dataset.pageId;
                    if (pageId) seen.current[pageId] = e;
                }
                if (rafPick.current) cancelAnimationFrame(rafPick.current);
                rafPick.current = requestAnimationFrame(pickBest);
            },
            {
                root,
                threshold: [0.01, 0.1, 0.25, 0.5, 0.75],
                rootMargin: "-20% 0px -70% 0px",
            }
        );

        activeObsRef.current = obs;

        // สำคัญ: ตอน obs เพิ่งสร้าง ให้ไป observe ของที่มี ref แล้ว
        Object.values(pageRefs.current).forEach((el) => {
            if (el) obs.observe(el);
        });

        return () => {
            if (rafPick.current) cancelAnimationFrame(rafPick.current);
            obs.disconnect();
            activeObsRef.current = null;
            seen.current = {};
        };
    }, [mode, scrollRootRef, onActivePageChangeFromScroll, isProgrammaticScrollRef, activePageId]);

    if (mode === "scroll") {
        const pages = document.pages.slice().sort((a, b) => a.index - b.index);

        return (
            <div style={{ padding: 24 }}>
                <div style={{ zoom }}>
                    {pages.map((p, idx) => (
                        <React.Fragment key={p.id}>
                            <VirtualPage
                                document={document}
                                page={p}
                                showMargin={showMargin}
                                active={p.id === activePageId}
                                onActivate={() => {
                                    markManualSelect();
                                    setActivePageId?.(p.id);
                                }}
                                rootRef={scrollRootRef}
                                registerRef={(el) => {
                                    const prev = pageRefs.current[p.id];
                                    if (prev && activeObsRef.current) activeObsRef.current.unobserve(prev);

                                    pageRefs.current[p.id] = el;

                                    if (el && activeObsRef.current) activeObsRef.current.observe(el);

                                    if (el && pendingScrollToRef.current === p.id) {
                                        pendingScrollToRef.current = null;
                                        scrollAndLockTo(el);
                                    }

                                    // ✅ ถ้า el เป็น null (โดนถอด) เคลียร์ entry ที่ค้าง
                                    if (!el) {
                                        delete seen.current[p.id];
                                    }
                                }}


                            />

                            {idx < pages.length - 1 && (
                                <GapAdd onAdd={() => onAddPageAfter?.(p.id)} />
                            )}
                        </React.Fragment>
                    ))}


                    {pages.length > 0 && (
                        <GapAdd onAdd={() => onAddPageAfter?.(pages[pages.length - 1].id)} />
                    )}
                </div>
            </div>
        );
    }

    // single page mode
    const page = document.pages.find((p) => p.id === activePageId) ?? null;
    if (!page) return <div>no page</div>;

    return (
        <div style={{ padding: 24 }}>
            <div style={{ zoom }}>
                <PageView
                    document={document}
                    page={page}
                    showMargin={showMargin}
                    active
                    onActivate={() => {
                        markManualSelect();
                        setActivePageId?.(page.id);
                    }}
                />
            </div>
        </div>
    );
}


function GapAdd({ onAdd, width = 820 }: { onAdd: () => void; width?: number }) {
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
            {/* wrapper ที่อิงความกว้าง page */}
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: width,
                    height: hover ? 56 : 8,
                    transition: "height 120ms ease",
                }}
            >
                {/* idle line */}
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

                {/* hover dashed frame */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        border: hover ? "2px dashed rgba(0,0,0,0.25)" : "2px dashed rgba(0,0,0,0)",
                        borderRadius: 10,
                        transition: "border-color 120ms ease",
                    }}
                />

                {/* plus button */}
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

function PageView({
    document,
    page,
    showMargin,
    active,
    onActivate,
    registerRef,
}: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
    registerRef?: (el: HTMLDivElement | null) => void;
}) {
    const preset: PagePreset | null =
        document.pagePresets.find((pp) => pp.id === page.presetId) ?? null;

    if (!preset) return <div>no preset</div>;

    const nodes = useMemo(() => {
        return document.nodes
            .filter((n) => n.pageId === page.id && n.visible !== false)
            .slice()
            .sort((a, b) => a.z - b.z);
    }, [document.nodes, page.id]);

    const margin = page.override?.margin
        ? { ...preset.margin, ...page.override.margin }
        : preset.margin;

    const pageStyle: React.CSSProperties = {
        position: "relative",
        width: preset.size.width,
        height: preset.size.height,
        background: "#ffffff",
        margin: "0 auto",
        boxShadow: active
            ? "0 10px 26px rgba(0,0,0,0.10), 0 0 30px rgba(59,130,246,0.28)"
            : "0 10px 26px rgba(0,0,0,0.10)",

    };

    return (
        <div
            ref={registerRef}
            style={pageStyle}
            onMouseDown={() => onActivate?.()}
        >
            {showMargin && (
                <div
                    style={{
                        position: "absolute",
                        left: margin.left,
                        top: margin.top,
                        width: preset.size.width - margin.left - margin.right,
                        height: preset.size.height - margin.top - margin.bottom,
                        border: "1px dashed #9ca3af",
                        pointerEvents: "none",
                    }}
                    title="margin"
                />
            )}

            {nodes.map((n) => (
                <NodeView key={n.id} node={n} document={document} />
            ))}
        </div>
    );
}
function NodeView({ node, document }: { node: NodeJson; document: DocumentJson }) {
    const base: React.CSSProperties = {
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        pointerEvents: "auto",
        userSelect: "none",
    };

    if (node.type === "box") {
        const s = node.style;
        return (
            <div
                style={{
                    ...base,
                    background: s.fill ?? "transparent",
                    border: `${s.strokeWidth ?? 0}px solid ${s.stroke ?? "transparent"}`,
                    borderRadius: s.radius ?? 0,
                }}
                title={node.name ?? node.id}
            />
        );
    }

    if (node.type === "text") {
        const st = node.style;
        return (
            <div
                style={{
                    ...base,
                    fontFamily: st.fontFamily,
                    fontSize: st.fontSize,
                    lineHeight: `${st.lineHeight}px`,
                    fontWeight: st.bold ? 700 : 400,
                    fontStyle: st.italic ? "italic" : "normal",
                    textDecoration: st.underline ? "underline" : "none",
                    color: st.color ?? "#111827",
                    textAlign: st.align,
                    whiteSpace: "pre-wrap",
                    overflow: "hidden",
                }}
                title={node.name ?? node.id}
            >
                {node.text}
            </div>
        );
    }

    if (node.type === "image") {
        const img: AssetImage | undefined = document.assets?.images.find(
            (i) => i.id === node.assetId
        );
        const src = img?.src ?? "";

        return (
            <img
                src={src}
                alt={node.name ?? node.id}
                style={{
                    ...base,
                    objectFit: fitMap[node.fit],
                    opacity: node.opacity ?? 1,
                    display: "block",
                }}
            />
        );
    }

    // group (ยังไม่ render children ซ้อนในเฟสนี้)
    return (
        <div style={{ ...base, border: "1px dashed #9ca3af" }} title={node.name ?? node.id}>
            group
        </div>
    );


}

function VirtualPage({
    document,
    page,
    showMargin,
    active,
    onActivate,
    rootRef,
    registerRef,
}: {
    document: DocumentJson;
    page: PageJson;
    showMargin: boolean;
    active: boolean;
    onActivate?: () => void;
    rootRef?: React.RefObject<HTMLElement | null>;
    registerRef?: (el: HTMLDivElement | null) => void;
}) {
    const [visible, setVisible] = React.useState(false);
    const holderRef = React.useRef<HTMLDivElement | null>(null);

    const preset =
        document.pagePresets.find((pp) => pp.id === page.presetId) ?? null;

    React.useEffect(() => {
        const el = holderRef.current;

        if (!el) return;

        const obs = new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            {
                root: rootRef?.current ?? null,
                rootMargin: "1200px 0px",
                threshold: 0.01,
            }
        );

        obs.observe(el);
        return () => obs.disconnect();
    }, [rootRef]);

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

