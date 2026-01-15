import type { DocumentJson, Id } from "../schema";

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

export function ensureHFCloneForPreset(doc: DocumentJson, presetId: Id) {
    const hf = ensureHeaderFooter(doc, presetId);

    // clone header/footer + nodeOrder ให้เป็น ref ใหม่
    doc.headerFooterByPresetId![presetId] = {
        header: { ...hf.header, nodeOrder: [...(hf.header.nodeOrder ?? [])] },
        footer: { ...hf.footer, nodeOrder: [...(hf.footer.nodeOrder ?? [])] },
    };

    return doc.headerFooterByPresetId![presetId]!;
}
