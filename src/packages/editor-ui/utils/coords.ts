// UI coordinate helpers.
//
// Goal: keep all interactions stable under zoom/transform/virtualization.
// Always convert from client-space (PointerEvent.clientX/Y) into page-space (document PT).
// client inputs are CSS px; output is doc PT.

export type PageSpacePoint = {
    /** page-space X (PT) */
    xPt: number;
    /** page-space Y (PT) */
    yPt: number;
    /** effective scaleX (client px per page PT) */
    scaleX: number;
    /** effective scaleY (client px per page PT) */
    scaleY: number;
    rect: DOMRect;
};

/**
 * Convert a client-space point to page-space.
 *
 * - Works even when the element is scaled by CSS transforms (zoom), because getBoundingClientRect
 *   returns the post-transform box.
 * - Uses independent scaleX/scaleY (future-proof if non-uniform scaling ever happens).
 */
export function clientToPagePoint(
    el: HTMLElement,
    clientX: number,
    clientY: number,
    pageWPt: number,
    pageHPt: number
): PageSpacePoint {
    const rect = el.getBoundingClientRect();
    const safeW = pageWPt || 1;
    const safeH = pageHPt || 1;
    const scaleX = rect.width / safeW || 1;
    const scaleY = rect.height / safeH || 1;
    const xPt = (clientX - rect.left) / scaleX;
    const yPt = (clientY - rect.top) / scaleY;
    const clampedX = Math.max(0, Math.min(pageWPt, xPt));
    const clampedY = Math.max(0, Math.min(pageHPt, yPt));
    return { xPt: clampedX, yPt: clampedY, scaleX, scaleY, rect };
}

export function clientToPageDelta(
    start: { xPt: number; yPt: number },
    current: { xPt: number; yPt: number }
) {
    return { dx: current.xPt - start.xPt, dy: current.yPt - start.yPt };
}
