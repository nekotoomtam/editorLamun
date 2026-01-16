import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { DocumentJson } from "../../editor-core/schema";
import type { Dispatch, SetStateAction } from "react";

enablePatches(); // ให้มีที่เดียวพอ (อย่าเรียกซ้ำในไฟล์อื่น)

export type DocHistoryEntry = {
    patches: Patch[];
    inversePatches: Patch[];
};

export type DocHistoryState = {
    undo: DocHistoryEntry[];
    redo: DocHistoryEntry[];
};

export function createInitialHistory(): DocHistoryState {
    return { undo: [], redo: [] };
}

export function createDocHistoryHelpers(args: {
    setDoc: Dispatch<SetStateAction<DocumentJson>>;
    setHistory: Dispatch<SetStateAction<DocHistoryState>>;
}) {
    const { setDoc, setHistory } = args;

    function applyDoc(mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) {
        const recordHistory = opts?.recordHistory ?? true;

        setDoc((prev) => {
            const [next, patches, inversePatches] = produceWithPatches(prev, (draft) => {
                mut(draft);
            });

            if (recordHistory && patches.length > 0) {
                setHistory((h) => ({
                    undo: [...h.undo, { patches, inversePatches }],
                    redo: [], // new change invalidates redo
                }));
            }

            return next as DocumentJson;
        });
    }

    function undoDoc() {
        setHistory((h) => {
            const last = h.undo[h.undo.length - 1];
            if (!last) return h;

            setDoc((prev) => applyPatches(prev, last.inversePatches) as DocumentJson);

            return {
                undo: h.undo.slice(0, -1),
                redo: [...h.redo, last],
            };
        });
    }

    function redoDoc() {
        setHistory((h) => {
            const last = h.redo[h.redo.length - 1];
            if (!last) return h;

            setDoc((prev) => applyPatches(prev, last.patches) as DocumentJson);

            return {
                undo: [...h.undo, last],
                redo: h.redo.slice(0, -1),
            };
        });
    }

    function canUndo(h: DocHistoryState) {
        return h.undo.length > 0;
    }

    function canRedo(h: DocHistoryState) {
        return h.redo.length > 0;
    }

    return { applyDoc, undoDoc, redoDoc, canUndo, canRedo };
}
