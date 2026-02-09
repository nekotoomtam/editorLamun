import type { DocumentJson, Id } from "../schema";

export type HeaderFooterConstraints = {
    /** header สูงสุดเป็น % ของ pageH */
    maxHeaderPct: number;
    /** footer สูงสุดเป็น % ของ pageH */
    maxFooterPct: number;
    /** ต้องเหลือ body (ภายใน content area = หลังหัก margin บน/ล่าง) อย่างน้อยเท่าไหร่ */
    minBodyPt: number;
    minHeaderPt: number;
    minFooterPt: number;
};

export const DEFAULT_HF_CONSTRAINTS: HeaderFooterConstraints = {
    maxHeaderPct: 0.25,
    maxFooterPct: 0.20,
    minBodyPt: 120,
    minHeaderPt: 0,
    minFooterPt: 0,
};

export function clampRepeatAreaHeightPt(args: {
    kind: "header" | "footer";
    desiredPt: number;
    pageH: number;
    /** contentH = pageH - marginTop - marginBottom (optional; fallback = pageH) */
    contentH?: number;
    otherPt: number;
    areaMinPt?: number;
    areaMaxPt?: number;
    constraints?: Partial<HeaderFooterConstraints>;
}) {
    const c = { ...DEFAULT_HF_CONSTRAINTS, ...(args.constraints ?? {}) };
    const pageH = args.pageH;
    const contentH = Math.max(0, args.contentH ?? pageH);
    const otherPt = Math.max(0, args.otherPt);
    const desiredPt = args.desiredPt;

    // ✅ Rule: header/footer may grow/shrink freely, but must leave body at least minBodyPx
    // inside the content area (pageH after subtracting top/bottom margins).
    const maxByBody = contentH - otherPt - c.minBodyPt;
    const maxByPct = pageH * (args.kind === "header" ? c.maxHeaderPct : c.maxFooterPct);

    const areaMax = args.areaMaxPt ?? Infinity;
    const areaMin = Math.max(args.areaMinPt ?? 0, args.kind === "header" ? c.minHeaderPt : c.minFooterPt);

    const maxRaw = Math.min(areaMax, maxByPct, maxByBody);
    const max = Math.max(0, maxRaw);
    const clamped = Math.max(areaMin, Math.min(max, Math.round(desiredPt)));

    return clamped;
}

/**
 * Clamp ในระดับ core (ใช้ตอน commit) เพื่อกัน state invalid เข้าสู่ document
 */
export function clampRepeatAreaHeightPtForPreset(doc: DocumentJson, presetId: Id, kind: "header" | "footer", desiredPt: number) {
    const preset = doc.pagePresetsById?.[presetId];
    if (!preset) return Math.round(desiredPt);

    const hf = ensureHeaderFooter(doc, presetId);
    const header = hf.header;
    const footer = hf.footer;

    const pageH = preset.size.height;
    const marginTop = Math.max(0, preset.margin?.top ?? 0);
    const marginBottom = Math.max(0, preset.margin?.bottom ?? 0);
    const contentH = Math.max(0, pageH - marginTop - marginBottom);
    const otherPt = kind === "header" ? (footer.heightPt ?? 0) : (header.heightPt ?? 0);
    const area = kind === "header" ? header : footer;

    return clampRepeatAreaHeightPt({
        kind,
        desiredPt,
        pageH,
        contentH,
        otherPt,
        areaMinPt: area.minHeightPt,
        areaMaxPt: area.maxHeightPt,
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
                heightPt: 100,
                anchorToMargins: true,
                nodeOrder: [],
            },
            footer: {
                id: `hf-${presetId}-footer`,
                name: "Footer",
                heightPt: 80,
                anchorToMargins: true,
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

/**
 * Update anchorToMargins for header/footer (per preset).
 * - Always clone the preset HF object before mutating.
 * - Re-clamp current heights to keep invariants.
 */
export function setRepeatAreaAnchorToMargins(doc: DocumentJson, presetId: Id, kind: "header" | "footer", anchor: boolean) {
    const hf = ensureHFCloneForPreset(doc, presetId);
    if (kind === "header") {
        hf.header.anchorToMargins = anchor;
        hf.header.heightPt = clampRepeatAreaHeightPtForPreset(doc, presetId, "header", hf.header.heightPt ?? 0);
    } else {
        hf.footer.anchorToMargins = anchor;
        hf.footer.heightPt = clampRepeatAreaHeightPtForPreset(doc, presetId, "footer", hf.footer.heightPt ?? 0);
    }
    return hf;
}
