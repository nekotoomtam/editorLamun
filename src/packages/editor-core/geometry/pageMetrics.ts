import type { Margin } from "../schema";

export type PageRects = {
    pageW: number;
    pageH: number;
    headerH: number;
    footerH: number;
    margin: Margin;
    /** content area ตาม margin (อ้างอิงจาก page) */
    contentRect: { x: number; y: number; w: number; h: number };
    /** rect ของ BODY content (ภายใน content area หลังตัด header/footer) ใน page-space */
    bodyRect: { x: number; y: number; w: number; h: number };
    /** rect ของ HEADER zone ใน page-space (ตำแหน่งวางจริง) */
    headerRect: { x: number; y: number; w: number; h: number };
    /** rect ของ FOOTER zone ใน page-space (ตำแหน่งวางจริง) */
    footerRect: { x: number; y: number; w: number; h: number };
    /** เส้นสำหรับ hit-test / guide ใน page-space */
    lines: {
        marginLeftX: number;
        marginRightX: number;
        /** ขอบบนของ content area (marginTop) */
        marginTopY: number;
        /** ขอบล่างของ content area (pageH - marginBottom) */
        marginBottomY: number;
        /** ขอบล่างของ header band (ภายใน content area) */
        headerBottomY: number;
        /** ขอบบนของ footer band (ภายใน content area) */
        footerTopY: number;
    };
};

export function computePageRects(args: {
    pageW: number;
    pageH: number;
    margin: Margin;
    headerH: number;
    footerH: number;
    /** ถ้า true: วาง header เริ่มที่ marginTop, ถ้า false: วาง header ที่ y=0 */
    headerAnchorToMargins?: boolean;
    /** ถ้า true: วาง footer จบที่ pageH - marginBottom, ถ้า false: วาง footer จบที่ pageH */
    footerAnchorToMargins?: boolean;
}): PageRects {
    const { pageW, pageH, margin, headerH, footerH } = args;
    const headerAnchor = args.headerAnchorToMargins ?? true;
    const footerAnchor = args.footerAnchorToMargins ?? true;

    const contentTop = Math.max(0, margin.top);
    const contentBottom = Math.max(contentTop, pageH - Math.max(0, margin.bottom));
    const contentLeft = Math.max(0, margin.left);
    const contentRight = Math.max(contentLeft, pageW - Math.max(0, margin.right));
    const contentW = Math.max(0, contentRight - contentLeft);
    const contentH = Math.max(0, contentBottom - contentTop);

    // header/footer "consume" space inside content area (invariant).
    const headerBandBottom = Math.min(contentBottom, contentTop + Math.max(0, headerH));
    const footerBandTop = Math.max(contentTop, contentBottom - Math.max(0, footerH));

    const contentRect = { x: contentLeft, y: contentTop, w: contentW, h: contentH };
    const bodyRect = { x: contentLeft, y: headerBandBottom, w: contentW, h: Math.max(0, footerBandTop - headerBandBottom) };

    // Placement rects for header/footer zones (anchor affects only Y position).
    const headerY = headerAnchor ? contentTop : 0;
    const footerY = footerAnchor ? (contentBottom - Math.max(0, footerH)) : (pageH - Math.max(0, footerH));
    const headerRect = { x: 0, y: headerY, w: pageW, h: Math.max(0, headerH) };
    const footerRect = { x: 0, y: footerY, w: pageW, h: Math.max(0, footerH) };

    return {
        pageW,
        pageH,
        headerH,
        footerH,
        margin,
        contentRect,
        bodyRect,
        headerRect,
        footerRect,
        lines: {
            marginLeftX: contentLeft,
            marginRightX: contentRight,
            marginTopY: contentTop,
            marginBottomY: contentBottom,
            headerBottomY: headerBandBottom,
            footerTopY: footerBandTop,
        },
    };
}
