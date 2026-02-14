const PT_PER_PX = 0.75;

export function ptToPx(pt: number): number {
  return pt / PT_PER_PX;
}

export function pxToPt(px: number): number {
  return px * PT_PER_PX;
}

export function pt100ToPx(v: number): number {
  return ptToPx(v / 100);
}

export function pxToPt100(px: number): number {
  return Math.round(pxToPt(px) * 100);
}
