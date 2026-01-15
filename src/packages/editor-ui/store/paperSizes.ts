export type PaperKey = "A4" | "A3" | "LETTER" | "LEGAL";

export const PAPER_SIZES: Record<PaperKey, { w: number; h: number }> = {
  A4: { w: 820, h: 1160 },
  A3: { w: 1160, h: 1640 },
  LETTER: { w: 816, h: 1056 },
  LEGAL: { w: 816, h: 1344 },
};
