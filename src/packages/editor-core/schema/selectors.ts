import type { DocumentJson, PageJson, NodeJson, Id } from "./index";
import { computePageRects } from "../geometry/pageMetrics";

export const getPages = (doc: DocumentJson): PageJson[] =>
    doc.pageOrder.map(id => doc.pagesById[id]).filter(Boolean);

export const getPage = (doc: DocumentJson, pageId: Id | null): PageJson | null =>
    pageId ? (doc.pagesById[pageId] ?? null) : null;

export const getPageNodeIds = (doc: DocumentJson, pageId: Id): Id[] =>
    doc.nodeOrderByPageId[pageId] ?? [];

export const getPageNodes = (doc: DocumentJson, pageId: Id): NodeJson[] =>
    getPageNodeIds(doc, pageId).map(id => doc.nodesById[id]).filter(Boolean);

export function getEffectiveMargin(doc: DocumentJson, pageId: Id) {
    const page = doc.pagesById[pageId];
    if (!page) return null;

    const preset = doc.pagePresetsById[page.presetId];
    if (!preset) return null;

    const source = page.marginSource ?? "preset";
    if (source === "page" && page.marginOverride) return page.marginOverride;

    return preset.margin;
}

export function getContentRect(doc: DocumentJson, pageId: Id) {
    const m = getEffectivePageMetrics(doc, pageId);
    if (!m) return null;
    const { x, y, w, h } = m.contentRect;
    return { x, y, w, h };
}


export function getNodesByTarget(
    doc: DocumentJson,
    pageId: Id,
    target: "page" | "header" | "footer"
): { nodesById: Record<Id, NodeJson>; nodeOrder: Id[] } {
    if (target === "page") {
        const order = doc.nodeOrderByPageId?.[pageId] ?? [];
        return { nodesById: doc.nodesById ?? {}, nodeOrder: order };
    }

    const page = doc.pagesById?.[pageId];
    if (!page) return { nodesById: {}, nodeOrder: [] };

    const hf = doc.headerFooterByPresetId?.[page.presetId];
    if (!hf) return { nodesById: {}, nodeOrder: [] };

    const zone = target === "header" ? hf.header : hf.footer;
    return { nodesById: doc.nodesById ?? {}, nodeOrder: zone.nodeOrder ?? [] };
}

export function getHeaderFooterZone(doc: DocumentJson, presetId: Id) {
    const hf = doc.headerFooterByPresetId?.[presetId];
    if (!hf) return null;
    return hf;
}

export function getEffectiveHeaderFooterHeights(doc: DocumentJson, pageId: Id): { headerH: number; footerH: number; headerAnchorToMargins: boolean; footerAnchorToMargins: boolean } {
    const page = doc.pagesById?.[pageId];
    if (!page) return { headerH: 0, footerH: 0, headerAnchorToMargins: true, footerAnchorToMargins: true };

    const hf = doc.headerFooterByPresetId?.[page.presetId];
    if (!hf) return { headerH: 0, footerH: 0, headerAnchorToMargins: true, footerAnchorToMargins: true };

    const headerH = page.headerHidden ? 0 : (hf.header?.heightPt ?? 0);
    const footerH = page.footerHidden ? 0 : (hf.footer?.heightPt ?? 0);

    return {
        headerH,
        footerH,
        headerAnchorToMargins: hf.header?.anchorToMargins ?? true,
        footerAnchorToMargins: hf.footer?.anchorToMargins ?? true,
    };
}


/**
 * rect ของ BODY content (ภายใน content area = หลังหัก margin บน/ล่าง)
 * layout = contentArea: [header band] -> [body] -> [footer band]
 */
export function getBodyContentRect(doc: DocumentJson, pageId: Id) {
    const m = getEffectivePageMetrics(doc, pageId);
    if (!m) return null;
    const { x, y, w, h } = m.bodyRect;
    return { x, y, w, h, headerH: m.headerH, footerH: m.footerH, pageW: m.pageW, pageH: m.pageH };
}


export function getEffectivePageMetrics(doc: DocumentJson, pageId: Id) {
    const page = doc.pagesById?.[pageId];
    if (!page) return null;

    const preset = doc.pagePresetsById?.[page.presetId];
    if (!preset) return null;

    const margin = getEffectiveMargin(doc, pageId);
    if (!margin) return null;

    const { headerH, footerH, headerAnchorToMargins, footerAnchorToMargins } = getEffectiveHeaderFooterHeights(doc, pageId);

    const pageW = preset.size.width;
    const pageH = preset.size.height;

    const rects = computePageRects({
        pageW,
        pageH,
        margin,
        headerH,
        footerH,
        headerAnchorToMargins,
        footerAnchorToMargins,
    });

    return {
        page,
        preset,
        margin,
        headerH,
        footerH,
        headerAnchorToMargins,
        footerAnchorToMargins,
        pageW,
        pageH,
        contentRect: rects.contentRect,
        bodyRect: rects.bodyRect,
        headerRect: rects.headerRect,
        footerRect: rects.footerRect,
        lines: rects.lines,
    };
}
