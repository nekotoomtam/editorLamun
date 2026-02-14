import { useMemo } from "react";
import type { DocumentJson, PageJson } from "../../../editor-core/schema";
import { pt100ToPx } from "../../utils/units";

export type PageMetrics = {
    offsets: number[];
    heights: number[];
    gapPx: number;
};

export function usePageMetrics(opts: {
    document: DocumentJson;
    pages: PageJson[];
    gapPx?: number;
}): PageMetrics {
    const { document, pages, gapPx = 36 } = opts;

    return useMemo(() => {
        const presetById = document.pagePresetsById ?? ({} as any);
        const offsets: number[] = [];
        const heights: number[] = [];

        let acc = 0;
        for (let i = 0; i < pages.length; i++) {
            const pg = pages[i];
            const hPt = presetById[pg.presetId]?.size?.height ?? 110000;
            const hPx = pt100ToPx(hPt);

            const hz = hPx;
            offsets.push(acc);
            heights.push(hz);

            acc += hz;
            if (i < pages.length - 1) acc += gapPx;
        }

        return { offsets, heights, gapPx };
    }, [document.pagePresetsById, pages, gapPx]);
}
