import type { DocumentJson, Id, NodeJson, PagePreset, PageJson } from "../schema";

export function setActivePage(session: { activePageId: Id | null }, pageId: Id | null) {
    session.activePageId = pageId;
}

export function addNode(doc: DocumentJson, pageId: Id, node: NodeJson) {
    // 1) ใส่ node ลง nodesById
    doc.nodesById[node.id] = node;

    // 2) ใส่ลง order ของ page
    const order = doc.nodeOrderByPageId[pageId] ?? [];
    doc.nodeOrderByPageId[pageId] = [...order, node.id];
}

export function updateNode(doc: DocumentJson, nodeId: Id, patch: Partial<NodeJson>) {
    const prev = doc.nodesById[nodeId];
    if (!prev) return;

    // กัน type เปลี่ยนมั่ว ๆ (แนะนำ)
    if ("type" in patch && (patch as any).type !== prev.type) {
        throw new Error("updateNode: cannot change node.type");
    }

    doc.nodesById[nodeId] = { ...(prev as any), ...(patch as any) };
}

const DEFAULT_MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };

export function addPagePreset(
    doc: DocumentJson,
    preset: Omit<PagePreset, "id"> & { id?: Id }
): Id {
    const id = preset.id ?? crypto.randomUUID();

    const p: PagePreset = {
        id,
        name: preset.name,
        size: preset.size,
        margin: preset.margin ?? DEFAULT_MARGIN,
        source: preset.source ?? "custom",
        locked: preset.locked ?? false,
        usageHint: preset.usageHint,
    };

    doc.pagePresetsById[id] = p;

    // กันซ้ำ (เผื่อเรียกซ้ำ)
    if (!doc.pagePresetOrder.includes(id)) {
        doc.pagePresetOrder.push(id);
    }

    return id;
}

export function ensureFirstPage(doc: DocumentJson, presetId: Id): Id | null {
    if (doc.pageOrder.length > 0) return null;

    const pageId = crypto.randomUUID();
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