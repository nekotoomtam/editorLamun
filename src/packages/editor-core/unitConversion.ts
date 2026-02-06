const PT_PER_PX = 0.75;

export function pxToPt(px: number): number {
    return px * PT_PER_PX;
}

export function ptToPx(pt: number): number {
    return pt / PT_PER_PX;
}
