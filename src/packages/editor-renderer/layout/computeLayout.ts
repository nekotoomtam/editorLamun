import type { DocumentJson, Id, NodeJson } from "../../editor-core/schema";
import {
    getNodesByTarget,
    getPages,
    getEffectivePageMetrics,
} from "../../editor-core/schema/selectors";
import { getZoneOriginsPt100 } from "../../editor-core/geometry/nodeSpace";
import type { DocumentLayout, LayoutNode, PageLayout } from "./types";

export function computeLayout(document: DocumentJson): DocumentLayout {
    const pages = getPages(document);

    const toLayoutNodes = (args: {
        target: "page" | "header" | "footer";
        nodeOrder: Id[];
        nodesById: Record<Id, NodeJson>;
        offsetX: number;
        offsetY: number;
    }): LayoutNode[] => {
        const { target, nodeOrder, nodesById, offsetX, offsetY } = args;

        return nodeOrder
            .map((id) => nodesById[id])
            .filter(Boolean)
            .map((n) => ({
                id: n.id,
                type: n.type,
                target,
                x: (n.x ?? 0) + offsetX,
                y: (n.y ?? 0) + offsetY,
                w: n.w ?? 0,
                h: n.h ?? 0,
                node: n,
            }));
    };

    const layouts: PageLayout[] = pages.map((page) => {
        const m = getEffectivePageMetrics(document, page.id);
        if (!m) {
            return {
                page,
                pageWidth: 0,
                pageHeight: 0,
                bodyRect: { x: 0, y: 0, w: 0, h: 0 },
                headerH: 0,
                footerH: 0,
                nodes: [],
            };
        }

        const pageTarget = getNodesByTarget(document, page.id, "page");
        const headerTarget = getNodesByTarget(document, page.id, "header");
        const footerTarget = getNodesByTarget(document, page.id, "footer");

        const zoneOrigins = getZoneOriginsPt100(m);

        const nodes: LayoutNode[] = [
            ...toLayoutNodes({
                target: "page",
                nodeOrder: pageTarget.nodeOrder,
                nodesById: pageTarget.nodesById,
                offsetX: zoneOrigins.bodyOrigin.x,
                offsetY: zoneOrigins.bodyOrigin.y,
            }),
            ...(m.headerH > 0
                ? toLayoutNodes({
                    target: "header",
                    nodeOrder: headerTarget.nodeOrder,
                    nodesById: headerTarget.nodesById,
                    offsetX: zoneOrigins.headerOrigin.x,
                    offsetY: zoneOrigins.headerOrigin.y,
                })
                : []),
            ...(m.footerH > 0
                ? toLayoutNodes({
                    target: "footer",
                    nodeOrder: footerTarget.nodeOrder,
                    nodesById: footerTarget.nodesById,
                    offsetX: zoneOrigins.footerOrigin.x,
                    offsetY: zoneOrigins.footerOrigin.y,
                })
                : []),
        ];

        return {
            page,
            pageWidth: m.pageWPt,
            pageHeight: m.pageHPt,
            bodyRect: m.bodyRectPt,
            headerH: m.headerH,
            footerH: m.footerH,
            nodes,
        };
    });

    return { document, pages: layouts };
}
