import type { DocumentJson, Id, NodeJson, PagePreset, PageJson, Margin } from "../schema";
import { createId } from "../schema";

export function ensureHFCloneForPreset(doc: DocumentJson, presetId: Id) {
    const hf = ensureHeaderFooter(doc, presetId);

    // clone header/footer + nodeOrder ให้เป็น ref ใหม่
    doc.headerFooterByPresetId![presetId] = {
        header: { ...hf.header, nodeOrder: [...(hf.header.nodeOrder ?? [])] },
        footer: { ...hf.footer, nodeOrder: [...(hf.footer.nodeOrder ?? [])] },
    };

    return doc.headerFooterByPresetId![presetId]!;
}


export function setActivePage(session: { activePageId: Id | null }, pageId: Id | null) {
    session.activePageId = pageId;
}

export function addNode(doc: DocumentJson, pageId: Id, node: NodeJson) {
    // Ensure owner is consistent (defensive)
    const nextNode: NodeJson = {
        ...(node as any),
        owner: { kind: "page", pageId },
        pageId,
    };
    // 1) ใส่ node ลง nodesById
    doc.nodesById[nextNode.id] = nextNode;

    if (!doc.nodeOrderByPageId[pageId]) doc.nodeOrderByPageId[pageId] = [];
    doc.nodeOrderByPageId[pageId] = [...doc.nodeOrderByPageId[pageId], nextNode.id];

}
export function addNodeToTarget(
    doc: DocumentJson,
    pageId: Id,
    target: "page" | "header" | "footer",
    node: NodeJson
) {
    const page = doc.pagesById?.[pageId];
    if (!page) return;

    const nextNode: NodeJson =
        target === "page"
            ? { ...(node as any), owner: { kind: "page", pageId }, pageId }
            : { ...(node as any), owner: { kind: target, presetId: page.presetId } as any };

    doc.nodesById[nextNode.id] = nextNode;

    if (target === "page") {
        if (!doc.nodeOrderByPageId[pageId]) doc.nodeOrderByPageId[pageId] = [];
        doc.nodeOrderByPageId[pageId] = [...doc.nodeOrderByPageId[pageId], nextNode.id];

        return;
    }

    const hf = ensureHFCloneForPreset(doc, page.presetId);
    const zone = target === "header" ? hf.header : hf.footer;
    zone.nodeOrder = [...(zone.nodeOrder ?? []), nextNode.id];
}

export function updateNode(doc: DocumentJson, nodeId: Id, patch: Partial<NodeJson>) {
    // Phase-1: nodes are stored globally in doc.nodesById
    const prev = doc.nodesById?.[nodeId];
    if (prev) {
        if ("type" in patch && (patch as any).type !== prev.type) {
            throw new Error("updateNode: cannot change node.type");
        }
        doc.nodesById[nodeId] = { ...(prev as any), ...(patch as any) };
        return;
    }
}


const DEFAULT_MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };

export function addPagePreset(
    doc: DocumentJson,
    preset: Omit<PagePreset, "id"> & { id?: Id }
): Id {
    const id = preset.id ?? createId("preset");

    const p: PagePreset = {
        id,
        name: preset.name,
        size: preset.size,
        margin: preset.margin ? clampMargin(preset.margin) : { ...DEFAULT_MARGIN },
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

export function ensureHeaderFooter(doc: DocumentJson, presetId: Id) {
    if (!doc.headerFooterByPresetId) doc.headerFooterByPresetId = {};
    if (!doc.headerFooterByPresetId[presetId]) {
        doc.headerFooterByPresetId[presetId] = {
            header: {
                id: `hf-${presetId}-header`,
                name: "Header",
                // Default: match current UI expectations.
                // If you need legacy behavior (0 height), migrate at load time.
                heightPx: 100,
                nodeOrder: [],
            },
            footer: {
                id: `hf-${presetId}-footer`,
                name: "Footer",
                heightPx: 80,
                nodeOrder: [],
            },
        };
    }
    return doc.headerFooterByPresetId[presetId];
}

function clampMargin(m: Margin): Margin {
    // กันค่าติดลบแบบหยาบ ๆ ก่อน
    const fix = (n: number) => Math.max(0, Math.round(n));
    return { top: fix(m.top), right: fix(m.right), bottom: fix(m.bottom), left: fix(m.left) };
}

// 1) แก้ preset (default)
export function setPresetMargin(doc: DocumentJson, presetId: Id, margin: Margin) {
    const preset = doc.pagePresetsById[presetId];
    if (!preset) return;

    doc.pagePresetsById[presetId] = { ...preset, margin: clampMargin(margin) };
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
