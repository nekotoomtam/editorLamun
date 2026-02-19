import type { Pt100 } from "../schema";

export type ZoneOriginPt100 = {
    x: Pt100;
    y: Pt100;
};

export type ZoneOriginsPt100 = {
    bodyOrigin: ZoneOriginPt100;
    headerOrigin: ZoneOriginPt100;
    footerOrigin: ZoneOriginPt100;
};

type ZoneMetrics = {
    contentRectPt: { x: Pt100 };
    bodyRectPt: { y: Pt100 };
    headerRectPt: { y: Pt100 };
    footerRectPt: { y: Pt100 };
};

export function getZoneOriginsPt100(metrics: ZoneMetrics): ZoneOriginsPt100 {
    const contentX = metrics.contentRectPt?.x ?? 0;

    return {
        bodyOrigin: { x: contentX, y: metrics.bodyRectPt?.y ?? 0 },
        headerOrigin: { x: contentX, y: metrics.headerRectPt?.y ?? 0 },
        footerOrigin: { x: contentX, y: metrics.footerRectPt?.y ?? 0 },
    };
}
