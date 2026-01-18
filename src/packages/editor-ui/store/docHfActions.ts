import type { DocumentJson, Id } from "../../editor-core/schema";
import * as Cmd from "../../editor-core/commands/docCommands";

export type ApplyDoc = (mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) => void;

export function createDocHfActions(args: { applyDoc: ApplyDoc }) {
    const { applyDoc } = args;

    function setPresetHeaderHeightPx(presetId: Id, heightPx: number) {
        // ✅ Always clamp via core rule to prevent invalid states.
        updateRepeatAreaHeightPx(presetId, "header", heightPx);
    }

    function setPresetFooterHeightPx(presetId: Id, heightPx: number) {
        // ✅ Always clamp via core rule to prevent invalid states.
        updateRepeatAreaHeightPx(presetId, "footer", heightPx);
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
            const clamped = Cmd.clampRepeatAreaHeightPxForPreset(draft, presetId, kind, heightPx);

            if (kind === "header") hf.header.heightPx = clamped;
            else hf.footer.heightPx = clamped;
        });
    }

    function updateRepeatAreaAnchorToMargins(presetId: Id, kind: "header" | "footer", anchorToMargins: boolean) {
        applyDoc((draft) => {
            Cmd.setRepeatAreaAnchorToMargins(draft, presetId, kind, anchorToMargins);
        });
    }

    return {
        setPresetHeaderHeightPx,
        setPresetFooterHeightPx,
        setPageHeaderFooterHidden,
        updateRepeatAreaHeightPx,
        updateRepeatAreaAnchorToMargins,
    };
}
