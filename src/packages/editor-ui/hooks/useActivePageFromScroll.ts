"use client";

import { useEffect, useRef } from "react";

export function useActivePageFromScroll({
    rootEl,
    pageRefs,
    activePageId,
    onChange,
    isProgrammaticScrollRef,
    lastManualSelectAtRef,
    activeFromScrollRef,
    pageIds,
}: {
    rootEl: HTMLElement | null;
    pageRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
    activePageId: string | null;
    onChange?: (pageId: string) => void;
    isProgrammaticScrollRef: React.RefObject<boolean>;
    lastManualSelectAtRef: React.RefObject<number>;
    activeFromScrollRef: React.RefObject<boolean>;
    pageIds: string[];
}) {
    const seen = useRef<Record<string, IntersectionObserverEntry>>({});
    const rafPick = useRef<number | null>(null);

    const lastRootBoundsRef = useRef<DOMRectReadOnly | null>(null);
    const holdTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!rootEl || !onChange) return;

        const pickBest = () => {
            rafPick.current = null;
            if (isProgrammaticScrollRef.current) return;

            const now = performance.now();
            if (now - lastManualSelectAtRef.current < 400) return;

            const entries = Object.values(seen.current).filter((e) => e.isIntersecting);
            if (!entries.length) return;

            const rootBounds = lastRootBoundsRef.current ?? entries[0]?.rootBounds ?? null;
            if (!rootBounds) return;

            const anchorY = rootBounds.top + rootBounds.height * 0.5;

            let best = entries[0];
            let bestScore = -Infinity;

            for (const e of entries) {
                const rect = e.boundingClientRect;
                const centerY = rect.top + rect.height * 0.5;
                const dist = Math.abs(centerY - anchorY);
                const score = e.intersectionRatio * 1000 - dist;

                if (score > bestScore) {
                    bestScore = score;
                    best = e;
                }
            }

            const pageId = (best.target as HTMLElement).dataset.pageId;
            if (!pageId || pageId === activePageId) return;

            // hysteresis
            const current = activePageId ? seen.current[activePageId] : null;
            if (current && current.isIntersecting) {
                const curRect = current.boundingClientRect;
                const curCenterY = curRect.top + curRect.height * 0.5;
                const curScore = current.intersectionRatio * 1000 - Math.abs(curCenterY - anchorY);
                if (bestScore - curScore < 60) return;
            }

            activeFromScrollRef.current = true;
            onChange(pageId);

            if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = window.setTimeout(() => {
                activeFromScrollRef.current = false;
            }, 50);
        };

        const obs = new IntersectionObserver(
            (entries) => {
                // เก็บ rootBounds ล่าสุด (ลดการไปอ่าน layout เอง)
                if (entries[0]?.rootBounds) lastRootBoundsRef.current = entries[0].rootBounds;

                for (const e of entries) {
                    const pid = (e.target as HTMLElement).dataset.pageId;
                    if (pid) seen.current[pid] = e;
                }

                if (rafPick.current) cancelAnimationFrame(rafPick.current);
                rafPick.current = requestAnimationFrame(pickBest);
            },
            {
                root: rootEl,
                threshold: [0.05, 0.25, 0.5],
                rootMargin: "-35% 0px -35% 0px",
            }
        );

        Object.values(pageRefs.current).forEach((el) => el && obs.observe(el));

        return () => {
            if (rafPick.current) cancelAnimationFrame(rafPick.current);
            if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
            obs.disconnect();
            seen.current = {};
            lastRootBoundsRef.current = null;
        };
    }, [
        rootEl,
        onChange,
        activePageId,
        pageIds.join("|"),
        pageRefs,
        isProgrammaticScrollRef,
        lastManualSelectAtRef,
        activeFromScrollRef,
    ]);
}
