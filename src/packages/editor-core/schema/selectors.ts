import type { DocumentJson, PageJson, NodeJson, Id } from "./index";

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
    const r = getBodyContentRect(doc, pageId);
    if (!r) return null;
    const { x, y, w, h } = r;
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

export function getEffectiveHeaderFooterHeights(doc: DocumentJson, pageId: Id) {
    const page = doc.pagesById?.[pageId];
    if (!page) return { headerH: 0, footerH: 0 };

    const hf = doc.headerFooterByPresetId?.[page.presetId];
    if (!hf) return { headerH: 0, footerH: 0 };

    const headerH = page.headerHidden ? 0 : (hf.header?.heightPx ?? 0);
    const footerH = page.footerHidden ? 0 : (hf.footer?.heightPx ?? 0);

    return { headerH, footerH };
}


/**
 * content rect ของ BODY (margin เป็นของ body เท่านั้น)
 * layout = header -> body(margin) -> footer
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

    const { headerH, footerH } = getEffectiveHeaderFooterHeights(doc, pageId);

    const pageW = preset.size.width;
    const pageH = preset.size.height;
    const bodyH = Math.max(0, pageH - headerH - footerH);

    const bodyRect = {
        x: margin.left,
        y: headerH + margin.top,
        w: Math.max(0, pageW - margin.left - margin.right),
        h: Math.max(0, bodyH - margin.top - margin.bottom),
    };

    return { page, preset, margin, headerH, footerH, pageW, pageH, bodyH, bodyRect };
}

