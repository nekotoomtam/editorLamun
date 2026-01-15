import type { Margin } from "../../editor-core/schema";

/**
 * Keep only defined margin fields so partial patches don't accidentally introduce `undefined`.
 */
export function cleanMarginPatch(p: Partial<Margin>): Partial<Margin> {
  const out: Partial<Margin> = {};
  if (p.top !== undefined) out.top = p.top;
  if (p.right !== undefined) out.right = p.right;
  if (p.bottom !== undefined) out.bottom = p.bottom;
  if (p.left !== undefined) out.left = p.left;
  return out;
}

/**
 * Expand a partial margin override onto a full margin object.
 */
export function toFullMargin(base: Margin, p?: Partial<Margin>): Margin {
  return {
    top: p?.top ?? base.top,
    right: p?.right ?? base.right,
    bottom: p?.bottom ?? base.bottom,
    left: p?.left ?? base.left,
  };
}
