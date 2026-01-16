import type { DocumentJson, Id } from "../../editor-core/schema";
import * as Cmd from "../../editor-core/commands/docCommands";

export type ApplyDoc = (mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) => void;

export function createDocHfActions(args: { applyDoc: ApplyDoc }) {
    const { applyDoc } = args;

    function setPresetHeaderHeightPx(presetId: Id, heightPx: number) {
        applyDoc((draft) => {
            const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
            hf.header.heightPx = heightPx;
        });
    }

    function setPresetFooterHeightPx(presetId: Id, heightPx: number) {
        applyDoc((draft) => {
            const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
            hf.footer.heightPx = heightPx;
        });
    }

    function setPageHeaderFooterHidden(pageId: Id, patch: { headerHidden?: boolean; footerHidden?: boolean }) {
        applyDoc((draft) => {
            const p = draft.pagesById?.[pageId];
            if (!p) return;
            draft.pagesById[pageId] = { ...p, ...patch };
        });
    }

    function updateRepeatAreaHeightPx(presetId: Id, kind: "header" | "footer", heightPx: number) {
        applyDoc((draft) => {
            const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
            const area = kind === "header" ? hf.header : hf.footer;

            const minH = area.minHeightPx ?? 0;
            const maxH = area.maxHeightPx ?? Infinity;
            const clamped = Math.max(minH, Math.min(maxH, Math.round(heightPx)));

            if (kind === "header") hf.header.heightPx = clamped;
            else hf.footer.heightPx = clamped;
        });
    }

    return {
        setPresetHeaderHeightPx,
        setPresetFooterHeightPx,
        setPageHeaderFooterHidden,
        updateRepeatAreaHeightPx,
    };
}
