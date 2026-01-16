import type { Dispatch, SetStateAction } from "react";
import type { EditorSession } from "../../editor-core/editorSession";
import type { Id } from "../../editor-core/schema";

export type SessionOnlyStore = {
    session: EditorSession;
    setActivePage: (id: Id | null) => void;
    setZoom: (z: number) => void;
    setSelectedNodeIds: (ids: Id[]) => void;
    setEditingTarget: (t: "page" | "header" | "footer") => void;
};

export function createInitialSession(activePageId: Id | null): EditorSession {
    return {
        activePageId,
        zoom: 1,
        selectedNodeIds: [],
        hoverNodeId: null,
        editingTarget: "page",
        tool: "select",
        drag: null,
        resize: null,
    };
}

export function createSessionStore(
    session: EditorSession,
    setSession: Dispatch<SetStateAction<EditorSession>>
): SessionOnlyStore {
    return {
        session,
        setActivePage: (id) => setSession((s) => ({ ...s, activePageId: id })),
        setZoom: (z) => setSession((s) => ({ ...s, zoom: z })),
        setSelectedNodeIds: (ids) => setSession((s) => ({ ...s, selectedNodeIds: ids })),
        setEditingTarget: (t) =>
            setSession((s) => ({
                ...s,
                editingTarget: t,
                selectedNodeIds: [],
                hoverNodeId: null,
            })),
    };
}
