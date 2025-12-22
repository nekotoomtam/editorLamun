import type { DocumentJson, Id, NodeJson } from "../schema";

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
