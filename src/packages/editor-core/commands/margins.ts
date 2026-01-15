import type { Margin } from "../schema";

// Keep margin rules in one place so both presets and page overrides behave identically.
export const DEFAULT_MARGIN: Margin = { top: 10, right: 10, bottom: 10, left: 10 };

export function clampMargin(m: Margin): Margin {
    // Defensive: prevent negative and non-integer margins.
    const fix = (n: number) => Math.max(0, Math.round(n));
    return {
        top: fix(m.top),
        right: fix(m.right),
        bottom: fix(m.bottom),
        left: fix(m.left),
    };
}
