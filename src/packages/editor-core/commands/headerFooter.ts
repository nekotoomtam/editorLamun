import type { DocumentJson, Id } from "../schema";

export type HeaderFooterConstraints = {
    /** header สูงสุดเป็น % ของ pageH */
    maxHeaderPct: number;
    /** footer สูงสุดเป็น % ของ pageH */
    maxFooterPct: number;
    /** ต้องเหลือ body อย่างน้อย (รวม margin) เท่าไหร่ */
    minBodyPx: number;
    minHeaderPx: number;
    minFooterPx: number;
};

export const DEFAULT_HF_CONSTRAINTS: HeaderFooterConstraints = {
    maxHeaderPct: 0.25,
    maxFooterPct: 0.20,
    minBodyPx: 120,
    minHeaderPx: 0,
    minFooterPx: 0,
};

export function clampRepeatAreaHeightPx(args: {
    kind: "header" | "footer";
    desiredPx: number;
    pageH: number;
    otherPx: number;
    areaMinPx?: number;
    areaMaxPx?: number;
    constraints?: Partial<HeaderFooterConstraints>;
}) {
    const c = { ...DEFAULT_HF_CONSTRAINTS, ...(args.constraints ?? {}) };
    const pageH = args.pageH;
    const otherPx = Math.max(0, args.otherPx);
    const desiredPx = args.desiredPx;

    const maxByBody = pageH - otherPx - c.minBodyPx;
    const maxByPct = pageH * (args.kind === "header" ? c.maxHeaderPct : c.maxFooterPct);

    const areaMax = args.areaMaxPx ?? Infinity;
    const areaMin = Math.max(args.areaMinPx ?? 0, args.kind === "header" ? c.minHeaderPx : c.minFooterPx);

    const max = Math.min(areaMax, maxByPct, maxByBody);
    const clamped = Math.max(areaMin, Math.min(max, Math.round(desiredPx)));

    return clamped;
}

/**
 * Clamp ในระดับ core (ใช้ตอน commit) เพื่อกัน state invalid เข้าสู่ document
 */
export function clampRepeatAreaHeightPxForPreset(doc: DocumentJson, presetId: Id, kind: "header" | "footer", desiredPx: number) {
    const preset = doc.pagePresetsById?.[presetId];
    if (!preset) return Math.round(desiredPx);

    const hf = ensureHeaderFooter(doc, presetId);
    const header = hf.header;
    const footer = hf.footer;

    const pageH = preset.size.height;
    const otherPx = kind === "header" ? (footer.heightPx ?? 0) : (header.heightPx ?? 0);
    const area = kind === "header" ? header : footer;

    return clampRepeatAreaHeightPx({
        kind,
        desiredPx,
        pageH,
        otherPx,
        areaMinPx: area.minHeightPx,
        areaMaxPx: area.maxHeightPx,
    });
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

export function ensureHFCloneForPreset(doc: DocumentJson, presetId: Id) {
    const hf = ensureHeaderFooter(doc, presetId);

    // clone header/footer + nodeOrder ให้เป็น ref ใหม่
    doc.headerFooterByPresetId![presetId] = {
        header: { ...hf.header, nodeOrder: [...(hf.header.nodeOrder ?? [])] },
        footer: { ...hf.footer, nodeOrder: [...(hf.footer.nodeOrder ?? [])] },
    };

    return doc.headerFooterByPresetId![presetId]!;
}
