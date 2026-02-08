import type { DocumentJson, Id, PagePreset } from "../../editor-core/schema";
import { normalizePresetOrientation } from "../../editor-core/schema";
import type { PaperKey } from "./paperSizes";
import { PAPER_SIZES } from "./paperSizes";
import { cleanMarginPatch, toFullMargin } from "./marginUtils";
import * as Cmd from "../../editor-core/commands/docCommands";
import { marginPatchPtToPt100, ptToPt100 } from "../utils/pt100";

export type ApplyDoc = (mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) => void;
export type ApplySession = (mut: (s: any) => any) => void; // จะ tighten ทีหลังก็ได้
export type Uid = (prefix: string) => Id;

export function createDocPresetsActions(args: {
    uid: Uid;
    applyDoc: ApplyDoc;
    applySession: ApplySession;
}) {
    const { uid, applyDoc, applySession } = args;

    function updatePresetSize(presetId: Id, patch: Partial<PagePreset["size"]>) {
        applyDoc((draft) => {
            const p = draft.pagePresetsById[presetId];
            if (!p || p.locked) return;

            const sizePatch: Partial<PagePreset["size"]> = {};
            if (patch.width !== undefined) sizePatch.width = ptToPt100(patch.width);
            if (patch.height !== undefined) sizePatch.height = ptToPt100(patch.height);

            draft.pagePresetsById[presetId] = {
                ...p,
                size: { ...p.size, ...sizePatch },
                source: p.source ?? "custom",
            };
        });
    }

    function updatePresetMargin(presetId: Id, patch: Partial<PagePreset["margin"]>) {
        applyDoc((draft) => {
            const p = draft.pagePresetsById[presetId];
            if (!p || p.locked) return;

            const merged = { ...p.margin, ...marginPatchPtToPt100(patch) };
            Cmd.setPresetMargin(draft, presetId, merged);
        });
    }

    function setPresetOrientation(presetId: Id, mode: "portrait" | "landscape") {
        applyDoc((draft) => {
            const p = draft.pagePresetsById[presetId];
            if (!p || p.locked) return;

            draft.pagePresetsById[presetId] = normalizePresetOrientation(p, mode);
        });
    }

    function setPageMarginSource(pageId: Id, source: "preset" | "page") {
        applyDoc((draft) => {
            const page = draft.pagesById[pageId];
            if (!page) return;

            if (source === "page") {
                const preset = draft.pagePresetsById[page.presetId];
                if (!preset) return;

                if (!page.marginOverride) {
                    Cmd.setPageMarginOverride(draft, pageId, { ...preset.margin });
                } else {
                    draft.pagesById[pageId] = { ...page, marginSource: "page" };
                }
            } else {
                Cmd.setPageMarginOverride(draft, pageId, undefined);
            }
        });
    }

    function updatePageMargin(pageId: Id, patch: Partial<PagePreset["margin"]>) {
        applyDoc((draft) => {
            const page = draft.pagesById[pageId];
            if (!page) return;

            const preset = draft.pagePresetsById[page.presetId];
            if (!preset) return;

            const baseFull = toFullMargin(preset.margin, page.marginOverride as any);
            const merged = { ...baseFull, ...cleanMarginPatch(marginPatchPtToPt100(patch)) };

            Cmd.setPageMarginOverride(draft, pageId, merged);
        });
    }

    function createPagePreset(
        draftInput: { name: string; orientation: "portrait" | "landscape"; paperKey: PaperKey },
        opts?: { bootstrap?: boolean }
    ): Id | null {
        const bootstrap = !!opts?.bootstrap;
        const presetId = uid("preset");
        let createdPageId: Id | null = null;

        applyDoc((docDraft) => {
            const baseSize = PAPER_SIZES[draftInput.paperKey] ?? PAPER_SIZES.A4;
            const size =
                draftInput.orientation === "portrait"
                    ? { width: baseSize.w, height: baseSize.h }
                    : { width: baseSize.h, height: baseSize.w };

            const base: PagePreset = {
                id: presetId,
                name: draftInput.name,
                size,
                margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
                source: "custom",
                locked: false,
            };

            docDraft.pagePresetsById[presetId] = normalizePresetOrientation(base, draftInput.orientation);
            if (!docDraft.pagePresetOrder.includes(presetId)) docDraft.pagePresetOrder.push(presetId);

            Cmd.ensureHeaderFooter(docDraft, presetId);

            if (bootstrap && docDraft.pageOrder.length === 0) {
                createdPageId = uid("page");
                docDraft.pageOrder.push(createdPageId);
                docDraft.pagesById[createdPageId] = {
                    id: createdPageId,
                    presetId,
                    name: "Page 1",
                    visible: true,
                    locked: false,
                };
                docDraft.nodeOrderByPageId[createdPageId] = [];
            }
        });

        if (createdPageId) applySession((s: any) => ({ ...s, activePageId: createdPageId }));
        return createdPageId;
    }

    function updatePreset(
        presetId: Id,
        patch: { name?: string; size?: { width: number; height: number }; orientation?: "portrait" | "landscape" }
    ) {
        applyDoc((draft) => {
            const p = draft.pagePresetsById[presetId];
            if (!p || p.locked) return;

            let nextP: PagePreset = { ...p };

            if (patch.name) {
                const nn = patch.name.trim();
                if (nn) nextP.name = nn;
            }

            if (patch.size) {
                const sizePatch: Partial<PagePreset["size"]> = {};
                if (patch.size.width !== undefined) sizePatch.width = ptToPt100(patch.size.width);
                if (patch.size.height !== undefined) sizePatch.height = ptToPt100(patch.size.height);
                nextP.size = { ...nextP.size, ...sizePatch };
                nextP.source = nextP.source ?? "custom";
            }

            if (patch.orientation) {
                nextP = normalizePresetOrientation(nextP, patch.orientation);
            }

            draft.pagePresetsById[presetId] = nextP;
        });
    }

    function deletePresetAndReassignPages(presetId: Id, opts: { reassignMap: Record<Id, Id> }) {
        const map = opts.reassignMap || {};

        applyDoc((draft) => {
            for (const [pageId, nextPresetId] of Object.entries(map) as Array<[Id, Id]>) {
                const page = draft.pagesById[pageId];
                if (!page) continue;
                if (page.presetId !== presetId) continue;

                Cmd.ensureHeaderFooter(draft, nextPresetId);
                draft.pagesById[pageId] = { ...page, presetId: nextPresetId };
            }

            delete draft.pagePresetsById[presetId];
            draft.pagePresetOrder = draft.pagePresetOrder.filter((id) => id !== presetId);

            if (draft.headerFooterByPresetId) delete draft.headerFooterByPresetId[presetId];
        });
    }

    return {
        updatePresetSize,
        updatePresetMargin,
        setPresetOrientation,
        setPageMarginSource,
        updatePageMargin,
        createPagePreset,
        updatePreset,
        deletePresetAndReassignPages,
    };
}
