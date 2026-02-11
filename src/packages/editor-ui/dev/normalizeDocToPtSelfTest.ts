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

  let thrown: unknown = null;
  try {
    normalizeDocToPt(legacy as unknown as DocumentJson);
  } catch (err) {
    thrown = err;
  }

  if (!(thrown instanceof Error)) {
    throw new Error("normalizeDocToPt self-test failed (guard): expected Error for unit:px");
  }
  assertEqual(
    "guard message includes unsupported px",
    Number(thrown.message.includes("unit:'px'")),
    1
  );
}
