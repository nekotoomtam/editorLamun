"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentJson } from "../../editor-core/schema";

type PageId = string;

export function usePageNodesMock(doc: DocumentJson) {
    const pagesSorted = useMemo(
        () => doc.pages.slice().sort((a, b) => a.index - b.index),
        [doc.pages]
    );

    const pageIndexById = useMemo(() => {
        const m = new Map<string, number>();
        pagesSorted.forEach((p, i) => m.set(p.id, i));
        return m;
    }, [pagesSorted]);

    // UI state (ไว้ให้ react rerender)
    const [loadingSet, setLoadingSet] = useState<Set<PageId>>(() => new Set());
    const [loadedSet, setLoadedSet] = useState<Set<PageId>>(() => new Set());

    // ✅ source-of-truth กัน stale
    const loadingRef = useRef<Set<PageId>>(new Set());
    const loadedRef = useRef<Set<PageId>>(new Set());

    useEffect(() => { loadingRef.current = loadingSet; }, [loadingSet]);
    useEffect(() => { loadedRef.current = loadedSet; }, [loadedSet]);

    // cache nodes
    const nodesByPageRef = useRef<Map<PageId, any[]>>(new Map());

    // ✅ token กัน race ต่อ page
    const reqTokenByPageRef = useRef<Map<PageId, number>>(new Map());

    const ensure = useCallback((pageId: PageId) => {
        if (!pageId) return;

        // ✅ อ่านจาก ref (ไม่ stale)
        if (loadedRef.current.has(pageId) || loadingRef.current.has(pageId)) return;

        setLoadingSet(prev => {
            const next = new Set(prev);
            next.add(pageId);
            return next;
        });

        // bump token
        const nextToken = (reqTokenByPageRef.current.get(pageId) ?? 0) + 1;
        reqTokenByPageRef.current.set(pageId, nextToken);

        const ms = 200 + Math.floor(Math.random() * 450);

        window.setTimeout(() => {
            // ✅ ถ้ามี request ใหม่กว่าแล้ว ให้ทิ้งผลลัพธ์เก่า
            if (reqTokenByPageRef.current.get(pageId) !== nextToken) return;

            // mock nodes
            nodesByPageRef.current.set(pageId, []);

            setLoadingSet(prev => {
                const next = new Set(prev);
                next.delete(pageId);
                return next;
            });

            setLoadedSet(prev => {
                const next = new Set(prev);
                next.add(pageId);
                return next;
            });
        }, ms);
    }, []);

    const ensureAround = useCallback((activePageId: PageId, radius = 2) => {
        const idx = pageIndexById.get(activePageId);
        if (idx == null) return;

        for (let d = -radius; d <= radius; d++) {
            const p = pagesSorted[idx + d];
            if (p) ensure(p.id);
        }
    }, [ensure, pageIndexById, pagesSorted]);

    const isLoading = useCallback((pageId: PageId) => loadingSet.has(pageId), [loadingSet]);
    const isLoaded = useCallback((pageId: PageId) => loadedSet.has(pageId), [loadedSet]);

    return {
        ensure,
        ensureAround,
        isLoading,
        isLoaded,
        getNodes: (pageId: PageId) => nodesByPageRef.current.get(pageId) ?? [],
    };
}
