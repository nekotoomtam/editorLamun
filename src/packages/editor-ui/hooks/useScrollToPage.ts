"use client";

import { useCallback, useRef } from "react";

export function useScrollToPage({
    rootEl,
    pageRefs,
    isProgrammaticScrollRef,
}: {
    rootEl: HTMLElement | null;
    pageRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
    isProgrammaticScrollRef: React.RefObject<boolean>;
}) {
    const pendingScrollToRef = useRef<string | null>(null);
    const unlockRafRef = useRef<number | null>(null);
    const lastManualSelectAtRef = useRef(0);

    const markManualSelect = () => {
        lastManualSelectAtRef.current = performance.now();
    };

    const scrollAndLockToEl = useCallback(
        (el: HTMLElement) => {
            if (!rootEl) return;

            isProgrammaticScrollRef.current = true;

            const rootRect = rootEl.getBoundingClientRect();
            const targetRect = el.getBoundingClientRect();
            const targetTop = rootEl.scrollTop + (targetRect.top - rootRect.top);

            rootEl.scrollTo({ top: targetTop, behavior: "smooth" });

            const tolerance = 6;
            const startedAt = performance.now();
            const maxMs = 1200;

            const tick = () => {
                if (!rootEl || !el.isConnected) {
                    isProgrammaticScrollRef.current = false;
                    return;
                }

                const arrived = Math.abs(rootEl.scrollTop - targetTop) <= tolerance;
                const timeout = performance.now() - startedAt > maxMs;

                if (arrived || timeout) {
                    isProgrammaticScrollRef.current = false;
                    return;
                }

                unlockRafRef.current = requestAnimationFrame(tick);
            };

            if (unlockRafRef.current) cancelAnimationFrame(unlockRafRef.current);
            unlockRafRef.current = requestAnimationFrame(tick);
        },
        [rootEl, isProgrammaticScrollRef]
    );

    const scrollToPage = useCallback(
        (pageId: string) => {
            if (!rootEl) return;

            const el = pageRefs.current[pageId];
            if (!el) {
                pendingScrollToRef.current = pageId;
                return;
            }

            scrollAndLockToEl(el);
        },
        [rootEl, pageRefs, scrollAndLockToEl]
    );

    const registerPageRef = useCallback(
        (pageId: string, el: HTMLDivElement | null) => {
            pageRefs.current[pageId] = el;

            // เคลียร์กรณีโดนถอด
            if (!el) return;

            // ถ้ามี pending ที่รอ ref โผล่ -> scroll ไปเลย
            if (pendingScrollToRef.current === pageId) {
                pendingScrollToRef.current = null;
                scrollToPage(pageId);
            }
        },
        [pageRefs, scrollToPage]
    );

    return {
        scrollToPage,
        registerPageRef,
        markManualSelect,
        lastManualSelectAtRef,
    };
}
