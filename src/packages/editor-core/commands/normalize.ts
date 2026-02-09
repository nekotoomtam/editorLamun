import type { DocumentJson, Id, PageJson, RepeatArea } from "../schema";
import { pxToPt } from "../unitConversion";
import { clampMargin } from "./margins";

/**
 * Backward/defensive normalization for page margin fields.
 *
 * Invariants:
 * - If marginSource === "page" then marginOverride MUST exist (and be clamped)
 * - If marginSource === "preset" then marginOverride MUST be undefined
 */
export function normalizeDocMargins(doc: DocumentJson): boolean {
  let changed = false;

  const pageIds: Id[] = (doc.pageOrder?.length
    ? doc.pageOrder
    : (Object.keys(doc.pagesById ?? {}) as Id[]));

  for (const pageId of pageIds) {
    const page = doc.pagesById?.[pageId];
    if (!page) continue;

    const source: "preset" | "page" = (page.marginSource ?? "preset");

    if (source === "page") {
      // Invalid legacy state: marginSource=page but missing override.
      if (!page.marginOverride) {
        const next: PageJson = { ...page, marginSource: "preset", marginOverride: undefined };
        doc.pagesById[pageId] = next;
        changed = true;
        continue;
      }

      const clamped = clampMargin(page.marginOverride);
      const same =
        clamped.top === page.marginOverride.top &&
        clamped.right === page.marginOverride.right &&
        clamped.bottom === page.marginOverride.bottom &&
        clamped.left === page.marginOverride.left;

      if (!same || page.marginSource !== "page") {
        doc.pagesById[pageId] = { ...page, marginSource: "page", marginOverride: clamped };
        changed = true;
      }
      continue;
    }

    // preset source (or unspecified) should not carry an override.
    if (page.marginSource !== "preset" || page.marginOverride) {
      doc.pagesById[pageId] = { ...page, marginSource: "preset", marginOverride: undefined };
      changed = true;
    }
  }

  return changed;
}

export function normalizeDocToPt(doc: DocumentJson): DocumentJson {
  if (doc.unit !== "px") {
    return doc;
  }

  const toPt = (value: number) => pxToPt(value);
  const toMargin = (margin: { top: number; right: number; bottom: number; left: number }) => ({
    top: toPt(margin.top),
    right: toPt(margin.right),
    bottom: toPt(margin.bottom),
    left: toPt(margin.left),
  });
  const toRepeatArea = (area: RepeatArea): RepeatArea => ({
    ...area,
    heightPt: toPt(area.heightPt),
    minHeightPt: area.minHeightPt === undefined ? undefined : toPt(area.minHeightPt),
    maxHeightPt: area.maxHeightPt === undefined ? undefined : toPt(area.maxHeightPt),
  });

  const pagePresetsById: DocumentJson["pagePresetsById"] = {};
  for (const [presetId, preset] of Object.entries(doc.pagePresetsById)) {
    pagePresetsById[presetId] = {
      ...preset,
      size: {
        width: toPt(preset.size.width),
        height: toPt(preset.size.height),
      },
      margin: toMargin(preset.margin),
    };
  }

  const headerFooterByPresetId = doc.headerFooterByPresetId
    ? Object.fromEntries(
        Object.entries(doc.headerFooterByPresetId).map(([presetId, areas]) => [
          presetId,
          {
            header: toRepeatArea(areas.header),
            footer: toRepeatArea(areas.footer),
          },
        ])
      )
    : undefined;

  const pagesById: DocumentJson["pagesById"] = {};
  for (const [pageId, page] of Object.entries(doc.pagesById)) {
    pagesById[pageId] = page.marginOverride
      ? { ...page, marginOverride: toMargin(page.marginOverride) }
      : { ...page };
  }

  const nodesById: DocumentJson["nodesById"] = {};
  for (const [nodeId, node] of Object.entries(doc.nodesById)) {
    const base = {
      ...node,
      x: toPt(node.x),
      y: toPt(node.y),
      w: toPt(node.w),
      h: toPt(node.h),
    };

    if (node.type === "text") {
      const letterSpacing = (node.style as { letterSpacing?: number }).letterSpacing;
      nodesById[nodeId] = {
        ...base,
        style: {
          ...node.style,
          fontSize: toPt(node.style.fontSize),
          lineHeight: toPt(node.style.lineHeight),
          ...(typeof letterSpacing === "number" ? { letterSpacing: toPt(letterSpacing) } : {}),
        },
      };
    } else {
      nodesById[nodeId] = base;
    }
  }

  const guides = doc.guides
    ? {
        ...doc.guides,
        byId: Object.fromEntries(
          Object.entries(doc.guides.byId).map(([guideId, guide]) => [
            guideId,
            { ...guide, pos: toPt(guide.pos) },
          ])
        ),
      }
    : undefined;

  return {
    ...doc,
    unit: "pt",
    pagePresetsById,
    headerFooterByPresetId,
    pagesById,
    nodesById,
    guides,
  };
}
