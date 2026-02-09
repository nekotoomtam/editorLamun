import type { DocumentJson, Id } from "../../editor-core/schema";
import * as Cmd from "../../editor-core/commands/docCommands";

export type ApplyDoc = (mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) => void;

export function createDocHfActions(args: { applyDoc: ApplyDoc }) {
    const { applyDoc } = args;

    function setPresetHeaderHeightPt(presetId: Id, heightPt: number) {
        // ✅ Always clamp via core rule to prevent invalid states.
        updateRepeatAreaHeightPt(presetId, "header", heightPt);
    }

    function setPresetFooterHeightPt(presetId: Id, heightPt: number) {
        // ✅ Always clamp via core rule to prevent invalid states.
        updateRepeatAreaHeightPt(presetId, "footer", heightPt);
    }

    function setPageHeaderFooterHidden(pageId: Id, patch: { headerHidden?: boolean; footerHidden?: boolean }) {
        applyDoc((draft) => {
            const p = draft.pagesById?.[pageId];
            if (!p) return;
            draft.pagesById[pageId] = { ...p, ...patch };
        });
    }

    function updateRepeatAreaHeightPt(presetId: Id, kind: "header" | "footer", heightPt: number) {
        applyDoc((draft) => {
            const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
            const clamped = Cmd.clampRepeatAreaHeightPtForPreset(draft, presetId, kind, heightPt);

            if (kind === "header") hf.header.heightPt = clamped;
            else hf.footer.heightPt = clamped;
        });
    }

    function updateRepeatAreaAnchorToMargins(presetId: Id, kind: "header" | "footer", anchorToMargins: boolean) {
        applyDoc((draft) => {
            Cmd.setRepeatAreaAnchorToMargins(draft, presetId, kind, anchorToMargins);
        });
    }

    return {
        setPresetHeaderHeightPt,
        setPresetFooterHeightPt,
        setPageHeaderFooterHidden,
        updateRepeatAreaHeightPt,
        updateRepeatAreaAnchorToMargins,
    };
}
