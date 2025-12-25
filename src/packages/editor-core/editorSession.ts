import type { Id } from "./schema";

export type EditorTool = "select" | "pan" | "text" | "box" | "image" | "field";

export type EditorSession = {
  activePageId: Id | null;
  zoom: number;

  selectedNodeIds: Id[]; // หรือ single ก็ได้
  hoverNodeId: Id | null;

  tool: EditorTool;

  // เผื่ออนาคตลาก/ย่อขยาย (ยังไม่ต้องใช้ก็ได้)
  drag?: null | {
    nodeId: Id;
    startMouse: { x: number; y: number };
    startRect: { x: number; y: number; w: number; h: number };
  };

  resize?: null | {
    nodeId: Id;
    handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";
    startMouse: { x: number; y: number };
    startRect: { x: number; y: number; w: number; h: number };
  };
};
