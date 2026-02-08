import type { DocumentJson, Id } from "../schema";

export type HeaderFooterConstraints = {
    /** header สูงสุดเป็น % ของ pageH */
    maxHeaderPct: number;
    /** footer สูงสุดเป็น % ของ pageH */
    maxFooterPct: number;
    /** ต้องเหลือ body (ภายใน content area = หลังหัก margin บน/ล่าง) อย่างน้อยเท่าไหร่ */
    minBodyPx: number;   // pt100 (legacy name)
    minHeaderPx: number; // pt100 (legacy name)
    minFooterPx: number; // pt100 (legacy name)
};

export const DEFAULT_HF_CONSTRAINTS: HeaderFooterConstraints = {
    maxHeaderPct: 0.25,
    maxFooterPct: 0.20,
    minBodyPx: 12000,
    minHeaderPx: 0,
    minFooterPx: 0,
};

export function clampRepeatAreaHeightPx(args: {
    kind: "header" | "footer";
    desiredPx: number; // pt100 (legacy name)
    pageH: number;     // pt100
    /** contentH = pageH - marginTop - marginBottom (optional; fallback = pageH) */
    contentH?: number; // pt100
    otherPx: number;   // pt100 (legacy name)
    areaMinPx?: number; // pt100 (legacy name)
    areaMaxPx?: number; // pt100 (legacy name)
    constraints?: Partial<HeaderFooterConstraints>;
}) {
    const c = { ...DEFAULT_HF_CONSTRAINTS, ...(args.constraints ?? {}) };
    const pageH = args.pageH;
    const contentH = Math.max(0, args.contentH ?? pageH);
    const otherPx = Math.max(0, args.otherPx);
    const desiredPx = args.desiredPx;

    // ✅ Rule: header/footer may grow/shrink freely, but must leave body at least minBodyPx
    // inside the content area (pageH after subtracting top/bottom margins).
    const maxByBody = contentH - otherPx - c.minBodyPx;
    const maxByPct = pageH * (args.kind === "header" ? c.maxHeaderPct : c.maxFooterPct);

    const areaMax = args.areaMaxPx ?? Infinity;
    const areaMin = Math.max(args.areaMinPx ?? 0, args.kind === "header" ? c.minHeaderPx : c.minFooterPx);

    const maxRaw = Math.min(areaMax, maxByPct, maxByBody);
    const max = Math.max(0, maxRaw);
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
    const marginTop = Math.max(0, preset.margin?.top ?? 0);
    const marginBottom = Math.max(0, preset.margin?.bottom ?? 0);
    const contentH = Math.max(0, pageH - marginTop - marginBottom);
    const otherPx = kind === "header" ? (footer.heightPx ?? 0) : (header.heightPx ?? 0);
    const area = kind === "header" ? header : footer;

    return clampRepeatAreaHeightPx({
        kind,
        desiredPx,
        pageH,
        contentH,
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
                heightPx: 10000,
                anchorToMargins: true,
                nodeOrder: [],
            },
            footer: {
                id: `hf-${presetId}-footer`,
                name: "Footer",
                heightPx: 8000,
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
        hf.header.heightPx = clampRepeatAreaHeightPxForPreset(doc, presetId, "header", hf.header.heightPx ?? 0);
    } else {
        hf.footer.anchorToMargins = anchor;
        hf.footer.heightPx = clampRepeatAreaHeightPxForPreset(doc, presetId, "footer", hf.footer.heightPx ?? 0);
    }
    return hf;
}
