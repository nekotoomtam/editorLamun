import type { Margin } from "../../editor-core/schema";

export const PT100_PER_PT = 100;

export function pt100ToPt(value: number): number {
    return value / PT100_PER_PT;
}

export function ptToPt100(value: number): number {
    return Math.round(value * PT100_PER_PT);
}

export function marginPt100ToPt(m: Margin): Margin {
    return {
        top: pt100ToPt(m.top),
        right: pt100ToPt(m.right),
        bottom: pt100ToPt(m.bottom),
        left: pt100ToPt(m.left),
    };
}

export function marginPtToPt100(m: Margin): Margin {
    return {
        top: ptToPt100(m.top),
        right: ptToPt100(m.right),
        bottom: ptToPt100(m.bottom),
        left: ptToPt100(m.left),
    };
}

export function marginPatchPtToPt100(m: Partial<Margin>): Partial<Margin> {
    const out: Partial<Margin> = {};
    if (m.top !== undefined) out.top = ptToPt100(m.top);
    if (m.right !== undefined) out.right = ptToPt100(m.right);
    if (m.bottom !== undefined) out.bottom = ptToPt100(m.bottom);
    if (m.left !== undefined) out.left = ptToPt100(m.left);
    return out;
}
