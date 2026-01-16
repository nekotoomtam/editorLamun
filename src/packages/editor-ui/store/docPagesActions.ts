import type { Id, DocumentJson } from "../../editor-core/schema";
import * as Cmd from "../../editor-core/commands/docCommands";

export type ApplyDoc = (mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) => void;
export type ApplySession = (mut: (s: any) => any) => void; // เดี๋ยวค่อย tighten เป็น EditorSession
export type Uid = (prefix: string) => Id;

export function createDocPagesActions(args: {
    uid: Uid;
    applyDoc: ApplyDoc;
    applySession: (mut: (s: { activePageId: Id | null; selectedNodeIds: Id[]; hoverNodeId: Id | null }) => any) => void;
}) {
    const { uid, applyDoc, applySession } = args;

    function addPageToEnd(): Id {
        const newPageId = uid("page");
        let nextActiveId: Id | null = newPageId;

        applyDoc((draft) => {
            const lastPageId = draft.pageOrder[draft.pageOrder.length - 1];
            const lastPage = lastPageId ? draft.pagesById[lastPageId] : null;

            const presetId =
                lastPage?.presetId ?? draft.pagePresetOrder[0] ?? Object.keys(draft.pagePresetsById)[0];

            if (!presetId) {
                nextActiveId = null;
                return;
            }

            draft.pageOrder = [...draft.pageOrder, newPageId];
            draft.pagesById[newPageId] = {
                id: newPageId,
                presetId,
                name: `Page ${draft.pageOrder.length}`,
                visible: true,
                locked: false,
            };
            draft.nodeOrderByPageId[newPageId] = [];
        });

        if (nextActiveId) applySession((s) => ({ ...s, activePageId: nextActiveId }));
        return newPageId;
    }

    function insertPageAfter(afterPageId: Id): Id {
        const newPageId = uid("page");
        let ok = true;

        applyDoc((draft) => {
            const after = draft.pagesById[afterPageId];
            if (!after) {
                ok = false;
                return;
            }

            const idx = draft.pageOrder.indexOf(afterPageId);
            if (idx < 0) {
                ok = false;
                return;
            }

            draft.pageOrder = [
                ...draft.pageOrder.slice(0, idx + 1),
                newPageId,
                ...draft.pageOrder.slice(idx + 1),
            ];

            draft.pagesById[newPageId] = {
                id: newPageId,
                presetId: after.presetId,
                name: undefined,
                visible: true,
                locked: false,
            };

            draft.nodeOrderByPageId[newPageId] = [];
        });

        if (ok) applySession((s) => ({ ...s, activePageId: newPageId }));
        return newPageId;
    }

    function deletePage(pageId: Id) {
        let nextOrder: Id[] = [];
        let deletedNodeIds: Id[] = [];
        let idxBeforeDelete = -1;

        applyDoc((draft) => {
            idxBeforeDelete = draft.pageOrder.indexOf(pageId);
            if (idxBeforeDelete < 0) return;

            const order = draft.nodeOrderByPageId?.[pageId] ?? [];
            deletedNodeIds = [...order];

            nextOrder = draft.pageOrder.filter((id) => id !== pageId);
            draft.pageOrder = nextOrder;

            delete draft.pagesById[pageId];
            delete draft.nodeOrderByPageId[pageId];

            for (const nid of deletedNodeIds) delete draft.nodesById[nid];
        });

        if (idxBeforeDelete < 0) return;

        applySession((s) => {
            const isDeletingActive = s.activePageId === pageId;

            const nextActiveId = isDeletingActive
                ? (nextOrder[idxBeforeDelete - 1] ?? nextOrder[idxBeforeDelete] ?? nextOrder[0] ?? null)
                : s.activePageId;

            return {
                ...s,
                activePageId: nextActiveId,
                selectedNodeIds: s.selectedNodeIds.filter((id) => !deletedNodeIds.includes(id)),
                hoverNodeId: s.hoverNodeId && deletedNodeIds.includes(s.hoverNodeId) ? null : s.hoverNodeId,
            };
        });
    }

    function setPagePreset(pageId: Id, presetId: Id) {
        applyDoc((draft) => {
            const page = draft.pagesById[pageId];
            if (!page) return;

            Cmd.ensureHeaderFooter(draft, presetId);
            draft.pagesById[pageId] = { ...page, presetId };
        });
    }

    return { addPageToEnd, insertPageAfter, deletePage, setPagePreset };
}
