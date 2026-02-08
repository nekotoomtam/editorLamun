export type PaperKey = "A4" | "A3" | "LETTER" | "LEGAL";

export const PAPER_SIZES: Record<PaperKey, { w: number; h: number }> = {
  A4: { w: 59500, h: 84200 },
  A3: { w: 84200, h: 119100 },
  LETTER: { w: 61200, h: 79200 },
  LEGAL: { w: 61200, h: 100800 },
};
