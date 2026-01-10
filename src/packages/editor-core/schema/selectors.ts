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
    if (source === "page" && page.pageMargin) return page.pageMargin;

    const base = preset.margin;
    const ov = page.marginOverride;
    return ov ? { ...base, ...ov } : base;
}

export function getContentRect(doc: DocumentJson, pageId: Id) {
    const page = doc.pagesById[pageId];
    if (!page) return null;

    const preset = doc.pagePresetsById[page.presetId];
    if (!preset) return null;

    const m = getEffectiveMargin(doc, pageId);
    if (!m) return null;

    return {
        x: m.left,
        y: m.top,
        w: Math.max(0, preset.size.width - m.left - m.right),
        h: Math.max(0, preset.size.height - m.top - m.bottom),
    };
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
    return { nodesById: zone.nodesById ?? {}, nodeOrder: zone.nodeOrder ?? [] };
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
    const page = doc.pagesById?.[pageId];
    if (!page) return null;

    const preset = doc.pagePresetsById?.[page.presetId];
    if (!preset) return null;

    const m = getEffectiveMargin(doc, pageId);
    if (!m) return null;

    const { headerH, footerH } = getEffectiveHeaderFooterHeights(doc, pageId);

    const pageW = preset.size.width;
    const pageH = preset.size.height;

    const bodyH = Math.max(0, pageH - headerH - footerH);

    return {
        x: m.left,
        y: headerH + m.top,
        w: Math.max(0, pageW - m.left - m.right),
        h: Math.max(0, bodyH - m.top - m.bottom),
        headerH,
        footerH,
        pageW,
        pageH,
    };
}
