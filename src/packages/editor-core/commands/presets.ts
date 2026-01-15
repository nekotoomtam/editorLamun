import type { DocumentJson, Id, Margin, PagePreset } from "../schema";
import { createId } from "../schema";
import { clampMargin, DEFAULT_MARGIN } from "./margins";

export function addPagePreset(
    doc: DocumentJson,
    preset: Omit<PagePreset, "id"> & { id?: Id }
): Id {
    const id = preset.id ?? createId("preset");

    const p: PagePreset = {
        id,
        name: preset.name,
        size: preset.size,
        margin: preset.margin ? clampMargin(preset.margin) : { ...DEFAULT_MARGIN },
        source: preset.source ?? "custom",
        locked: preset.locked ?? false,
        usageHint: preset.usageHint,
    };

    doc.pagePresetsById[id] = p;

    // กันซ้ำ (เผื่อเรียกซ้ำ)
    if (!doc.pagePresetOrder.includes(id)) {
        doc.pagePresetOrder.push(id);
    }

    return id;
}

// 1) แก้ preset (default)
export function setPresetMargin(doc: DocumentJson, presetId: Id, margin: Margin) {
    const preset = doc.pagePresetsById[presetId];
    if (!preset) return;

    doc.pagePresetsById[presetId] = { ...preset, margin: clampMargin(margin) };
}
