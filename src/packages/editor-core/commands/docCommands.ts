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
export function addNodeToTarget(
    doc: DocumentJson,
    pageId: Id,
    target: "page" | "header" | "footer",
    node: NodeJson
) {
    if (target === "page") return addNode(doc, pageId, node);

    const page = doc.pagesById?.[pageId];
    if (!page) return;

    const hf = ensureHeaderFooter(doc, page.presetId);
    const zone = target === "header" ? hf.header : hf.footer;

    zone.nodesById[node.id] = node;
    zone.nodeOrder = [...(zone.nodeOrder ?? []), node.id];
}


export function updateNode(doc: DocumentJson, nodeId: Id, patch: Partial<NodeJson>) {
    // 1) ลองหาใน page nodes ก่อน
    const prev = doc.nodesById?.[nodeId];
    if (prev) {
        if ("type" in patch && (patch as any).type !== prev.type) {
            throw new Error("updateNode: cannot change node.type");
        }
        doc.nodesById[nodeId] = { ...(prev as any), ...(patch as any) };
        return;
    }

    // 2) หาใน header/footer zones
    const hfMap = doc.headerFooterByPresetId;
    if (!hfMap) return;

    for (const presetId of Object.keys(hfMap)) {
        const hf = hfMap[presetId];
        for (const z of [hf.header, hf.footer]) {
            const p = z.nodesById?.[nodeId];
            if (!p) continue;

            if ("type" in patch && (patch as any).type !== p.type) {
                throw new Error("updateNode: cannot change node.type");
            }
            z.nodesById[nodeId] = { ...(p as any), ...(patch as any) };
            return;
        }
    }
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

function ensureHeaderFooter(doc: DocumentJson, presetId: Id) {
    if (!doc.headerFooterByPresetId) doc.headerFooterByPresetId = {};
    if (!doc.headerFooterByPresetId[presetId]) {
        doc.headerFooterByPresetId[presetId] = {
            header: {
                id: `header-${presetId}`,
                name: "Header",
                heightPx: 0, // ค่าเริ่มต้น 0 = ยังไม่เปิด (กันเอกสารเก่าพัง)
                nodesById: {},
                nodeOrder: [],
            },
            footer: {
                id: `footer-${presetId}`,
                name: "Footer",
                heightPx: 0,
                nodesById: {},
                nodeOrder: [],
            },
        };
    }
    return doc.headerFooterByPresetId[presetId];
}

