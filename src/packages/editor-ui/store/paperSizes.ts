export type PaperKey = "A4" | "A3" | "LETTER" | "LEGAL";

export const PAPER_SIZES: Record<PaperKey, { w: number; h: number }> = {
  A4: { w: 595, h: 842 },
  A3: { w: 842, h: 1191 },
  LETTER: { w: 612, h: 792 },
  LEGAL: { w: 612, h: 1008 },
};
