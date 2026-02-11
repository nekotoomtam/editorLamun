import { useMemo } from "react";
import type { DocumentJson, PageJson } from "../../../editor-core/schema";

export function usePageList(document: DocumentJson) {
    return useMemo(() => {
        const order = document.pageOrder ?? [];
        const byId = document.pagesById ?? ({} as any);
        const pages = order.map(id => byId[id]).filter(Boolean) as PageJson[];

        const indexById: Record<string, number> = {};
        pages.forEach((p, i) => (indexById[p.id] = i));

        return { pages, indexById };
    }, [document.pageOrder, document.pagesById]);
}
