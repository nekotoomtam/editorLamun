"use client";

import { useCallback, useRef } from "react";

type ScrollBehavior = "auto" | "smooth";

export function useScrollToPage({
    rootEl,
    pageRefs,
    isProgrammaticScrollRef,
    getPageTop,
    zoom = 1,
    paddingTop = 0,
}: {
    rootEl: HTMLElement | null;
    pageRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
    isProgrammaticScrollRef: React.RefObject<boolean>;
    getPageTop?: (pageId: string) => number | null;
    zoom?: number;
    paddingTop?: number;
}) {
    const pendingScrollToRef = useRef<{ pageId: string; behavior: ScrollBehavior } | null>(null);
    const lastManualSelectAtRef = useRef(0);

    const markManualSelect = () => {
        lastManualSelectAtRef.current = performance.now();
    };

    const PAGE_SCROLL_TOP_OFFSET = 16;

    const scrollAndLockToEl = useCallback(
        (el: HTMLElement, behavior: ScrollBehavior = "auto") => {
            if (!rootEl) return;


            const rootRect = rootEl.getBoundingClientRect();
            const targetRect = el.getBoundingClientRect();
            const targetTop = rootEl.scrollTop + (targetRect.top - rootRect.top);

            const nextTop = Math.max(0, targetTop - PAGE_SCROLL_TOP_OFFSET);

            rootEl.scrollTo({ top: nextTop, behavior });
        },
        [rootEl]
    );


    const scrollToPage = useCallback(
        (pageId: string, behavior: ScrollBehavior = "auto") => {
            if (!rootEl) return;

            const el = pageRefs.current[pageId];
            if (!el) {
                // virtualization-safe: if element is not mounted, fall back to computed top.
                const top = getPageTop?.(pageId);
                if (top != null && rootEl) {
                    isProgrammaticScrollRef.current = true;
                    const nextTop = Math.max(0, top * zoom + paddingTop - PAGE_SCROLL_TOP_OFFSET);
                    rootEl.scrollTo({ top: nextTop, behavior });
                    // unlock after a short moment
                    window.setTimeout(() => (isProgrammaticScrollRef.current = false), 120);
                    return;
                }
                pendingScrollToRef.current = { pageId, behavior };
                return;
            }

            scrollAndLockToEl(el, behavior);
        },
        [rootEl, pageRefs, scrollAndLockToEl]
    );

    const registerPageRef = useCallback(
        (pageId: string, el: HTMLDivElement | null) => {
            pageRefs.current[pageId] = el;
            if (!el) return;

            const pending = pendingScrollToRef.current;
            if (pending?.pageId === pageId) {
                pendingScrollToRef.current = null;
                scrollToPage(pageId, pending.behavior);
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