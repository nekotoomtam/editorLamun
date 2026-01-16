import type { Margin } from "../schema";

export type PageRects = {
    pageW: number;
    pageH: number;
    headerH: number;
    footerH: number;
    bodyH: number;
    margin: Margin;
    /** rect ของ BODY content (หลัง header/footer + margin) ใน page-space */
    bodyRect: { x: number; y: number; w: number; h: number };
    /** เส้นสำหรับ hit-test / guide ใน page-space */
    lines: {
        marginLeftX: number;
        marginRightX: number;
        marginTopY: number;
        marginBottomY: number;
        headerBottomY: number;
        footerTopY: number;
    };
};

export function computePageRects(args: {
    pageW: number;
    pageH: number;
    margin: Margin;
    headerH: number;
    footerH: number;
}): PageRects {
    const { pageW, pageH, margin, headerH, footerH } = args;

    const bodyH = Math.max(0, pageH - headerH - footerH);

    const bodyRect = {
        x: margin.left,
        y: headerH + margin.top,
        w: Math.max(0, pageW - margin.left - margin.right),
        h: Math.max(0, bodyH - margin.top - margin.bottom),
    };

    return {
        pageW,
        pageH,
        headerH,
        footerH,
        bodyH,
        margin,
        bodyRect,
        lines: {
            marginLeftX: margin.left,
            marginRightX: pageW - margin.right,
            marginTopY: headerH + margin.top,
            marginBottomY: pageH - footerH - margin.bottom,
            headerBottomY: headerH,
            footerTopY: pageH - footerH,
        },
    };
}
