import type { DocumentJson } from "../../editor-core/schema";
import { normalizeDocToPt } from "../../editor-core/commands/normalize";

type LegacyPxDoc = Omit<DocumentJson, "unit"> & { unit: "px" };

function assertEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`normalizeDocToPt self-test failed (${label}): ${actual} !== ${expected}`);
  }
}

export function runNormalizeDocToPtSelfTest() {
  const legacy: LegacyPxDoc = {
    id: "doc-legacy-px",
    name: "Legacy PX",
    version: 1,
    unit: "px",
    pagePresetOrder: ["p1"],
    pagePresetsById: {
      p1: {
        id: "p1",
        name: "Preset",
        size: { width: 100, height: 200 },
        margin: { top: 10, right: 20, bottom: 30, left: 40 },
      },
    },
    headerFooterByPresetId: {
      p1: {
        header: { id: "hf-p1-header", heightPt: 50, nodeOrder: [] },
        footer: { id: "hf-p1-footer", heightPt: 60, nodeOrder: [] },
      },
    },
    pageOrder: ["page-1"],
    pagesById: {
      "page-1": {
        id: "page-1",
        presetId: "p1",
        marginSource: "page",
        marginOverride: { top: 11, right: 22, bottom: 33, left: 44 },
      },
    },
    nodesById: {
      "text-1": {
        id: "text-1",
        owner: { kind: "page", pageId: "page-1" },
        pageId: "page-1",
        type: "text",
        x: 8,
        y: 9,
        w: 80,
        h: 40,
        text: "t",
        style: {
          fontFamily: "system-ui",
          fontSize: 12,
          lineHeight: 18,
          align: "left",
        },
      },
    },
    nodeOrderByPageId: {
      "page-1": ["text-1"],
    },
    guides: {
      order: ["g1"],
      byId: { g1: { id: "g1", pos: 70 } },
    },
  };

  const next = normalizeDocToPt(legacy);
  if (next.unit !== "pt") {
    throw new Error(`normalizeDocToPt self-test failed (unit): ${next.unit} !== pt`);
  }

  assertEqual("preset.size.width", next.pagePresetsById.p1.size.width, 75);
  assertEqual("preset.size.height", next.pagePresetsById.p1.size.height, 150);
  assertEqual("preset.margin.top", next.pagePresetsById.p1.margin.top, 7.5);
  assertEqual("page.marginOverride.left", next.pagesById["page-1"].marginOverride!.left, 33);
  assertEqual("node.x", next.nodesById["text-1"].x, 6);
  assertEqual("node.w", next.nodesById["text-1"].w, 60);
  assertEqual("text.fontSize", (next.nodesById["text-1"] as any).style.fontSize, 9);
  assertEqual("text.lineHeight", (next.nodesById["text-1"] as any).style.lineHeight, 13.5);
  assertEqual("hf.header.heightPt", next.headerFooterByPresetId!.p1.header.heightPt!, 37.5);
  assertEqual("guide.pos", next.guides!.byId.g1.pos, 52.5);
}
