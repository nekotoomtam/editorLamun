import type { DocumentJson, PageJson, NodeJson, Id } from "./index";

export const getPages = (doc: DocumentJson): PageJson[] =>
    doc.pageOrder.map(id => doc.pagesById[id]).filter(Boolean);

export const getPage = (doc: DocumentJson, pageId: Id | null): PageJson | null =>
    pageId ? (doc.pagesById[pageId] ?? null) : null;

export const getPageNodeIds = (doc: DocumentJson, pageId: Id): Id[] =>
    doc.nodeOrderByPageId[pageId] ?? [];

export const getPageNodes = (doc: DocumentJson, pageId: Id): NodeJson[] =>
    getPageNodeIds(doc, pageId).map(id => doc.nodesById[id]).filter(Boolean);
