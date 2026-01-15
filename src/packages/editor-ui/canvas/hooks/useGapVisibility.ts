import { useMemo } from "react";
import type { Id, PageJson } from "../../editor-core/schema";

export function useGapVisibility(opts: {
    pages: PageJson[];
    anchorIndex: number;
    activePageId: Id | null;
    indexById: Record<string, number>;
    gapRadius?: number;
}) {
    const { pages, anchorIndex, activePageId, indexById, gapRadius = 1 } = opts;

    return useMemo(() => {
        const activeIndex = activePageId ? (indexById[activePageId] ?? -1) : -1;
        const shouldRenderGap = (idx: number) =>
            Math.abs(idx - anchorIndex) <= gapRadius ||
            (activeIndex >= 0 && Math.abs(idx - activeIndex) <= gapRadius);

        return { shouldRenderGap };
    }, [pages, anchorIndex, activePageId, indexById, gapRadius]);
}
