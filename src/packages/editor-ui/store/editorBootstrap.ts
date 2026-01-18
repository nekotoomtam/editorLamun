import type { DocumentJson } from "../../editor-core/schema";
import * as Cmd from "../../editor-core/commands/docCommands";

/**
 * Backward-compatible migration: old docs stored header/footer nodes inline under
 * headerFooterByPresetId.*.nodesById. We move those nodes into doc.nodesById with
 * a proper `owner` field and clear the inline storage.
 */
export function migrateInlineHeaderFooterNodes(d: DocumentJson): DocumentJson {
  const hfBy = d.headerFooterByPresetId;
  if (!hfBy) return d;

  let changed = false;
  const nodesById = { ...(d.nodesById ?? {}) };
  const nextHF: NonNullable<DocumentJson["headerFooterByPresetId"]> = { ...hfBy };

  for (const presetId of Object.keys(nextHF)) {
    const hf = nextHF[presetId];
    if (!hf) continue;

    const zones: Array<["header" | "footer", any]> = [
      ["header", hf.header],
      ["footer", hf.footer],
    ];

    for (const [kind, zone] of zones) {
      const inline = zone?.nodesById;
      if (!inline || Object.keys(inline).length === 0) continue;

      changed = true;
      for (const id of Object.keys(inline)) {
        const n = inline[id];
        if (!n) continue;
        const owner = (n as any).owner ?? { kind, presetId };
        nodesById[id] = { ...(n as any), owner };
      }

      // Remove inline storage; keep ordering only
      zone.nodesById = undefined;
    }
  }

  if (!changed) return d;
  return { ...d, nodesById, headerFooterByPresetId: nextHF };
}

/**
 * Initialize a doc to a safe runtime shape:
 * - migrates legacy HF inline nodes
 * - clones top-level maps to avoid mutating the incoming initialDoc
 * - ensures header/footer data exists for all presets
 */
export function bootstrapAllPresetHF(d: DocumentJson): DocumentJson {
  const next = migrateInlineHeaderFooterNodes(d);

  // Clone once (avoid mutating the incoming initialDoc)
  const draft: DocumentJson = {
    ...next,
    pagesById: { ...next.pagesById },
    nodesById: { ...next.nodesById },
    nodeOrderByPageId: { ...next.nodeOrderByPageId },
    pagePresetsById: { ...next.pagePresetsById },
    headerFooterByPresetId: next.headerFooterByPresetId
      ? { ...next.headerFooterByPresetId }
      : next.headerFooterByPresetId,
    pageOrder: [...next.pageOrder],
    pagePresetOrder: [...next.pagePresetOrder],
  };

  // Normalize legacy/invalid margin states (e.g. marginSource="page" but missing override).
  Cmd.normalizeDocMargins(draft);

  for (const presetId of draft.pagePresetOrder ?? []) {
    const hf = Cmd.ensureHeaderFooter(draft, presetId);

    // ✅ Normalize/clamp HF heights once at load time so the runtime state is always valid.
    // Rule: header/footer may change freely but must leave body at least minBodyPx inside
    // the content area (pageH after subtracting top/bottom margins).
    const h = Cmd.clampRepeatAreaHeightPxForPreset(draft, presetId, "header", hf.header.heightPx ?? 0);
    hf.header.heightPx = h;
    const f = Cmd.clampRepeatAreaHeightPxForPreset(draft, presetId, "footer", hf.footer.heightPx ?? 0);
    hf.footer.heightPx = f;
  }

  return draft;
}
