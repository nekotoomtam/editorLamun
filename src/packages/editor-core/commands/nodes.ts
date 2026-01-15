import type { DocumentJson, Id, NodeJson } from "../schema";
import { ensureHFCloneForPreset } from "./headerFooter";

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
    if (!prev) return;

    if ("type" in patch && (patch as any).type !== (prev as any).type) {
        throw new Error("updateNode: cannot change node.type");
    }

    doc.nodesById[nodeId] = { ...(prev as any), ...(patch as any) };
}
