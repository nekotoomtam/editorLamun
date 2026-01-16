import type { DocumentJson, Id, PageJson } from "../schema";
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
