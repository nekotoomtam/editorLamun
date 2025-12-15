"use client";

import { useEffect, useRef } from "react";

export function useActivePageFromScroll({
    rootEl,
    pageRefs,
    activePageId,
    onChange,
    isProgrammaticScrollRef,
    lastManualSelectAtRef,
    activeFromScrollRef
}: {
    rootEl: HTMLElement | null;
    pageRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
    activePageId: string | null;
    onChange?: (pageId: string) => void;
    isProgrammaticScrollRef: React.RefObject<boolean>;
    lastManualSelectAtRef: React.RefObject<number>;
    activeFromScrollRef: React.RefObject<boolean>;
}) {
    const seen = useRef<Record<string, IntersectionObserverEntry>>({});
    const rafPick = useRef<number | null>(null);

    useEffect(() => {
        if (!rootEl || !onChange) return;

        const pickBest = () => {
            rafPick.current = null;

            // ✅ กันช่วงเพิ่งคลิก (manual select)
            if (performance.now() - lastManualSelectAtRef.current < 300) return;

            // ✅ กัน programmatic scroll
            if (isProgrammaticScrollRef.current) return;

            const entries = Object.values(seen.current).filter((e) => e.isIntersecting);
            if (!entries.length) return;

            const rootRect = rootEl.getBoundingClientRect();
            const anchorY = rootRect.top + rootRect.height * 0.5;

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
            if (!pageId || pageId === activePageId) return;

            activeFromScrollRef.current = true;
            onChange(pageId);

        };

        const obs = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const pid = (e.target as HTMLElement).dataset.pageId;
                    if (pid) seen.current[pid] = e;
                }
                if (rafPick.current) cancelAnimationFrame(rafPick.current);
                rafPick.current = requestAnimationFrame(pickBest);
            },
            {
                root: rootEl,
                threshold: [0.01, 0.1, 0.25, 0.5, 0.75],
                rootMargin: "-40% 0px -40% 0px",
            }
        );

        Object.values(pageRefs.current).forEach((el) => el && obs.observe(el));

        return () => {
            if (rafPick.current) cancelAnimationFrame(rafPick.current);
            obs.disconnect();
            seen.current = {};
        };
    }, [
        rootEl,
        onChange,
        activePageId,
        pageRefs,
        isProgrammaticScrollRef,
        lastManualSelectAtRef,
    ]);
}
