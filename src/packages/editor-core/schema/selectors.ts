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

