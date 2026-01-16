// UI coordinate helpers.
//
// Goal: keep all interactions stable under zoom/transform/virtualization.
// Always convert from client-space (PointerEvent.clientX/Y) into page-space (document px).

export type PageSpacePoint = {
    /** page-space X (px) */
    px: number;
    /** page-space Y (px) */
    py: number;
    /** effective scaleX (client px per page px) */
    scaleX: number;
    /** effective scaleY (client px per page px) */
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
    pageW: number,
    pageH: number
): PageSpacePoint {
    const rect = el.getBoundingClientRect();
    const safeW = pageW || 1;
    const safeH = pageH || 1;
    const scaleX = rect.width / safeW || 1;
    const scaleY = rect.height / safeH || 1;
    const px = (clientX - rect.left) / scaleX;
    const py = (clientY - rect.top) / scaleY;
    return { px, py, scaleX, scaleY, rect };
}

export function clientToPageDelta(
    start: { px: number; py: number },
    current: { px: number; py: number }
) {
    return { dx: current.px - start.px, dy: current.py - start.py };
}
