import type { DocumentJson, Id, Margin, PageJson } from "../schema";
import { createId } from "../schema";
import { clampMargin } from "./margins";

export function ensureFirstPage(doc: DocumentJson, presetId: Id): Id | null {
    if (doc.pageOrder.length > 0) return null;

    const pageId = createId("page");
    const page: PageJson = {
        id: pageId,
        presetId,
        name: "Page 1",
        visible: true,
    };

    doc.pagesById[pageId] = page;
    doc.pageOrder.push(pageId);

    // ต้อง init order list ของ page นี้ ไม่งั้น addNode จะพังบางจุด
    if (!doc.nodeOrderByPageId[pageId]) doc.nodeOrderByPageId[pageId] = [];

    return pageId;
}

// 2) แก้เฉพาะหน้า (override)
export function setPageMarginOverride(doc: DocumentJson, pageId: Id, marginOverride?: Margin) {
    const page = doc.pagesById[pageId];
    if (!page) return;

    if (!marginOverride) {
        doc.pagesById[pageId] = { ...page, marginSource: "preset", marginOverride: undefined };
    } else {
        doc.pagesById[pageId] = { ...page, marginSource: "page", marginOverride: clampMargin(marginOverride) };
    }
}
