import type { Margin } from "../schema";

export type PageRects = {
    pageWPt: number;
    pageHPt: number;
    headerHPt: number;
    footerHPt: number;
    margin: Margin;
    /** content area ตาม margin (อ้างอิงจาก page) */
    contentRectPt: { x: number; y: number; w: number; h: number };
    /** rect ของ BODY content (ภายใน content area หลังตัด header/footer) ใน page-space */
    bodyRectPt: { x: number; y: number; w: number; h: number };
    /** rect ของ HEADER zone ใน page-space (ตำแหน่งวางจริง) */
    headerRectPt: { x: number; y: number; w: number; h: number };
    /** rect ของ FOOTER zone ใน page-space (ตำแหน่งวางจริง) */
    footerRectPt: { x: number; y: number; w: number; h: number };
    /** เส้นสำหรับ hit-test / guide ใน page-space */
    lines: {
        marginLeftX: number;
        marginRightX: number;
        /** ขอบบนของ content area (marginTop) */
        marginTopY: number;
        /** ขอบล่างของ content area (pageHPt - marginBottom) */
        marginBottomY: number;
        /** ขอบล่างของ header band (ภายใน content area) */
        headerBottomY: number;
        /** ขอบบนของ footer band (ภายใน content area) */
        footerTopY: number;
    };
};

export function computePageRects(args: {
    pageWPt: number;
    pageHPt: number;
    margin: Margin;
    headerHPt: number;
    footerHPt: number;
    /** ถ้า true: วาง header เริ่มที่ marginTop, ถ้า false: วาง header ที่ y=0 */
    headerAnchorToMargins?: boolean;
    /** ถ้า true: วาง footer จบที่ pageHPt - marginBottom, ถ้า false: วาง footer จบที่ pageHPt */
    footerAnchorToMargins?: boolean;
}): PageRects {
    const { pageWPt, pageHPt, margin, headerHPt, footerHPt } = args;
    const headerAnchor = args.headerAnchorToMargins ?? true;
    const footerAnchor = args.footerAnchorToMargins ?? true;

    const contentTop = Math.max(0, margin.top);
    const contentBottom = Math.max(contentTop, pageHPt - Math.max(0, margin.bottom));
    const contentLeft = Math.max(0, margin.left);
    const contentRight = Math.max(contentLeft, pageWPt - Math.max(0, margin.right));
    const contentW = Math.max(0, contentRight - contentLeft);
    const contentH = Math.max(0, contentBottom - contentTop);

    // header/footer "consume" space inside content area (invariant).
    const headerBandBottom = Math.min(contentBottom, contentTop + Math.max(0, headerHPt));
    const footerBandTop = Math.max(contentTop, contentBottom - Math.max(0, footerHPt));

    const contentRectPt = { x: contentLeft, y: contentTop, w: contentW, h: contentH };
    const bodyRectPt = { x: contentLeft, y: headerBandBottom, w: contentW, h: Math.max(0, footerBandTop - headerBandBottom) };

    // Placement rects for header/footer zones (anchor affects only Y position).
    const headerY = headerAnchor ? contentTop : 0;
    const footerY = footerAnchor ? (contentBottom - Math.max(0, footerHPt)) : (pageHPt - Math.max(0, footerHPt));
    const headerRectPt = { x: 0, y: headerY, w: pageWPt, h: Math.max(0, headerHPt) };
    const footerRectPt = { x: 0, y: footerY, w: pageWPt, h: Math.max(0, footerHPt) };

    return {
        pageWPt,
        pageHPt,
        headerHPt,
        footerHPt,
        margin,
        contentRectPt,
        bodyRectPt,
        headerRectPt,
        footerRectPt,
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
