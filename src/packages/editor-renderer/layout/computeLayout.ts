import type { DocumentJson } from "../../editor-core/schema";
import { getEffectivePageMetrics } from "../../editor-core/schema/selectors";
import type { DocumentLayout, LayoutNode, PageLayout } from "./types";

/**
 * Minimal layout pass.
 * - Computes page size/margins via core selectors.
 * - Produces absolutely positioned nodes (currently 1:1 from node json).
 *
 * This is a foundation for real text flow / measurement later.
 */
export function computeLayout(document: DocumentJson): DocumentLayout {
    const pages = document.pages ?? [];

    const layouts: PageLayout[] = pages.map((page) => {
        const m = getEffectivePageMetrics(document, page.id);
        const pageWidth = m.pageWidth;
        const pageHeight = m.pageHeight;

        // NOTE: for now, nodes are assumed absolute already.
        const nodes: LayoutNode[] = (page.nodes ?? []).map((n: any) => ({
            id: n.id,
            type: n.type,
            x: n.x ?? 0,
            y: n.y ?? 0,
            w: n.w ?? 0,
            h: n.h ?? 0,
            node: n,
        }));

        return { page, pageWidth, pageHeight, nodes };
    });

    return { document, pages: layouts };
}
