"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { DocumentJson, Id, NodeJson, PageJson, PagePreset } from "../../editor-core/schema";
import { normalizePresetOrientation, createId } from "../../editor-core/schema";
import { PAPER_SIZES, type PaperKey } from "./paperSizes";
import { bootstrapAllPresetHF } from "./editorBootstrap";
import { cleanMarginPatch, toFullMargin } from "./marginUtils";
import type { EditorSession } from "../../editor-core/editorSession";
import * as Sel from "../../editor-core/schema/selectors";
import * as Cmd from "../../editor-core/commands/docCommands";
type DocStore = {
    doc: DocumentJson;

    // history
    canUndo: () => boolean;
    canRedo: () => boolean;
    undo: () => void;
    redo: () => void;

    // selectors
    getPages: () => ReturnType<typeof Sel.getPages>;
    getPage: (id: Id | null) => ReturnType<typeof Sel.getPage>;
    getPageNodes: (pageId: Id) => ReturnType<typeof Sel.getPageNodes>;

    // doc actions
    updateNode: (nodeId: Id, patch: Partial<NodeJson>) => void;
    addNode: (pageId: Id, node: NodeJson, target: "page" | "header" | "footer") => void;

    // page actions
    addPageToEnd: () => Id;
    insertPageAfter: (afterPageId: Id) => Id;

    deletePage: (pageId: Id) => void;
    setPagePreset: (pageId: Id, presetId: Id) => void;
    updatePresetSize: (presetId: Id, patch: Partial<PagePreset["size"]>) => void;
    updatePresetMargin: (presetId: Id, patch: Partial<PagePreset["margin"]>) => void;
    setPageMarginSource: (pageId: Id, source: "preset" | "page") => void;
    updatePageMargin: (pageId: Id, patch: Partial<PagePreset["margin"]>) => void;
    setPresetOrientation: (presetId: Id, mode: "portrait" | "landscape") => void;
    createPagePreset: (
        draft: { name: string; orientation: "portrait" | "landscape"; paperKey: PaperKey },
        opts?: { bootstrap?: boolean }
    ) => Id | null;
    updatePreset: (
        presetId: Id,
        patch: { name?: string; size?: { width: number; height: number }; orientation?: "portrait" | "landscape" }
    ) => void;
    deletePresetAndReassignPages: (presetId: Id, opts: { reassignMap: Record<Id, Id> }) => void
    getNodesByTarget: (
        pageId: Id,
        target: "page" | "header" | "footer"
    ) => { nodesById: Record<Id, NodeJson>; nodeOrder: Id[] };
    setPresetHeaderHeightPx: (presetId: Id, heightPx: number) => void;
    setPresetFooterHeightPx: (presetId: Id, heightPx: number) => void;
    setPageHeaderFooterHidden: (pageId: Id, patch: { headerHidden?: boolean; footerHidden?: boolean }) => void;
    updateRepeatAreaHeightPx: (presetId: Id, kind: "header" | "footer", heightPx: number) => void;

};

type SessionOnlyStore = {
    session: EditorSession;
    setActivePage: (id: Id | null) => void;
    setZoom: (z: number) => void;
    setSelectedNodeIds: (ids: Id[]) => void;
    setEditingTarget: (t: "page" | "header" | "footer") => void;
};

const SessionCtx = createContext<SessionOnlyStore | null>(null);

const DocCtx = createContext<DocStore | null>(null);

// Enable Immer patches so we can build undo/redo from patches without changing core commands.
enablePatches();

type DocHistoryEntry = {
    patches: Patch[];
    inversePatches: Patch[];
};

// We use Immer patches to implement doc history (undo/redo) without rewriting all commands.
enablePatches();

function uid(prefix: string) {
    // Backward compatible wrapper: keep call sites readable.
    return createId(prefix);
}

export function EditorStoreProvider({
    initialDoc,
    children,
}: {
    initialDoc: DocumentJson;
    children: React.ReactNode;
}) {

    const [doc, setDoc] = useState<DocumentJson>(() => bootstrapAllPresetHF(initialDoc));

    const [history, setHistory] = useState<{ undo: DocHistoryEntry[]; redo: DocHistoryEntry[] }>(() => ({
        undo: [],
        redo: [],
    }));


    const [session, setSession] = useState<EditorSession>({
        activePageId: initialDoc.pageOrder[0] ?? null,
        zoom: 1,
        selectedNodeIds: [],
        hoverNodeId: null,
        editingTarget: "page",
        tool: "select",
        drag: null,
        resize: null,
    });

    function applyDoc(mut: (draft: DocumentJson) => void, opts?: { recordHistory?: boolean }) {
        const recordHistory = opts?.recordHistory ?? true;

        setDoc((prev) => {
            const [next, patches, inversePatches] = produceWithPatches(prev, (draft) => {
                mut(draft);
            });

            // Only record meaningful changes.
            if (recordHistory && patches.length > 0) {
                setHistory((h) => ({
                    undo: [...h.undo, { patches, inversePatches }],
                    // New change invalidates redo.
                    redo: [],
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

    function applySession(mut: (s: EditorSession) => EditorSession) {
        setSession(mut);
    }

    const sessionStore = useMemo<SessionOnlyStore>(() => {
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
    }, [session]);


    // Header/Footer ensure + clone is centralized in editor-core commands.


    const docStore = useMemo<DocStore>(() => {
        return {
            doc,

            // history
            canUndo: () => history.undo.length > 0,
            canRedo: () => history.redo.length > 0,
            undo: () => undoDoc(),
            redo: () => redoDoc(),

            // selectors
            getPages: () => Sel.getPages(doc),
            getPage: (id) => Sel.getPage(doc, id),
            getPageNodes: (pageId) => Sel.getPageNodes(doc, pageId),

            // doc actions
            updateNode: (nodeId, patch) => {
                applyDoc(next => {
                    Cmd.updateNode(next, nodeId, patch);
                });
            },

            addNode: (pageId, node, target) => {
                applyDoc(next => Cmd.addNodeToTarget(next, pageId, target, node));
            },

            addPageToEnd: () => {
                const newPageId = uid("page");
                let nextActiveId: Id | null = newPageId;

                applyDoc(draft => {
                    const lastPageId = draft.pageOrder[draft.pageOrder.length - 1];
                    const lastPage = lastPageId ? draft.pagesById[lastPageId] : null;

                    const presetId =
                        lastPage?.presetId ??
                        draft.pagePresetOrder[0] ??
                        Object.keys(draft.pagePresetsById)[0];

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

                if (nextActiveId) applySession(s => ({ ...s, activePageId: nextActiveId }));
                return newPageId;
            },

            insertPageAfter: (afterPageId: Id) => {
                const newPageId = uid("page");
                let ok = true;

                applyDoc(draft => {
                    const after = draft.pagesById[afterPageId];
                    if (!after) { ok = false; return; }

                    const idx = draft.pageOrder.indexOf(afterPageId);
                    if (idx < 0) { ok = false; return; }

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

                if (ok) applySession(s => ({ ...s, activePageId: newPageId }));
                return newPageId;
            },

            deletePage: (pageId) => {
                let nextOrder: Id[] = [];
                let deletedNodeIds: Id[] = [];
                let idxBeforeDelete = -1;

                applyDoc(draft => {
                    idxBeforeDelete = draft.pageOrder.indexOf(pageId);
                    if (idxBeforeDelete < 0) return; // page not found => no-op

                    // 1) collect nodes on that page
                    const order = draft.nodeOrderByPageId?.[pageId] ?? [];
                    deletedNodeIds = [...order];

                    // 2) remove from structures
                    nextOrder = draft.pageOrder.filter(id => id !== pageId);
                    draft.pageOrder = nextOrder;

                    // remove page
                    delete draft.pagesById[pageId];

                    // remove nodeOrder list for page
                    delete draft.nodeOrderByPageId[pageId];

                    // remove nodes (phase-1: nodes are global, so delete them)
                    for (const nid of deletedNodeIds) {
                        delete draft.nodesById[nid];
                    }
                });

                // if no change happened
                if (idxBeforeDelete < 0) return;

                applySession(s => {
                    const isDeletingActive = s.activePageId === pageId;

                    const nextActiveId = isDeletingActive
                        ? (nextOrder[idxBeforeDelete - 1] ?? nextOrder[idxBeforeDelete] ?? nextOrder[0] ?? null)
                        : s.activePageId;

                    return {
                        ...s,
                        activePageId: nextActiveId,
                        selectedNodeIds: s.selectedNodeIds.filter(id => !deletedNodeIds.includes(id)),
                        hoverNodeId: s.hoverNodeId && deletedNodeIds.includes(s.hoverNodeId) ? null : s.hoverNodeId,
                    };
                });
            },


            setPagePreset: (pageId, presetId) => {
                applyDoc(draft => {
                    const page = draft.pagesById[pageId];
                    if (!page) return;

                    Cmd.ensureHeaderFooter(draft, presetId);
                    draft.pagesById[pageId] = { ...page, presetId };
                });
            },



            updatePresetSize: (presetId, patch) => {
                applyDoc(draft => {
                    const p = draft.pagePresetsById[presetId];
                    if (!p || p.locked) return;

                    draft.pagePresetsById[presetId] = {
                        ...p,
                        size: { ...p.size, ...patch },
                        source: p.source ?? "custom",
                    };
                });
            },

            setPageMarginSource: (pageId, source) => {
                applyDoc(draft => {
                    const page = draft.pagesById[pageId];
                    if (!page) return;

                    if (source === "page") {
                        // เปิด override: ถ้ายังไม่มี override ให้ bootstrap จาก preset.margin
                        const preset = draft.pagePresetsById[page.presetId];
                        if (!preset) return;

                        if (!page.marginOverride) {
                            Cmd.setPageMarginOverride(draft, pageId, { ...preset.margin });
                        } else {
                            // แค่ set source ให้ชัด
                            draft.pagesById[pageId] = { ...page, marginSource: "page" };
                        }
                    } else {
                        // กลับไปใช้ preset: เคลียร์ override ทิ้ง (นี่แหละสำคัญ)
                        Cmd.setPageMarginOverride(draft, pageId, undefined);
                    }
                });
            },

            updatePageMargin: (pageId, patch) => {
                applyDoc(draft => {
                    const page = draft.pagesById[pageId];
                    if (!page) return;

                    const preset = draft.pagePresetsById[page.presetId];
                    if (!preset) return;

                    const baseFull = toFullMargin(preset.margin, page.marginOverride as any); // page.marginOverride อาจเป็น partial
                    const merged = { ...baseFull, ...cleanMarginPatch(patch) };

                    Cmd.setPageMarginOverride(draft, pageId, merged);
                });
            },


            updatePresetMargin: (presetId, patch) => {
                applyDoc(draft => {
                    const p = draft.pagePresetsById[presetId];
                    if (!p || p.locked) return;

                    const merged = { ...p.margin, ...patch };
                    Cmd.setPresetMargin(draft, presetId, merged);
                });
            },


            setPresetOrientation: (presetId, mode) => {
                applyDoc(draft => {
                    const p = draft.pagePresetsById[presetId];
                    if (!p || p.locked) return;

                    draft.pagePresetsById[presetId] = normalizePresetOrientation(p, mode);
                });
            },

            createPagePreset: (draft, opts) => {
                const bootstrap = !!opts?.bootstrap;
                const presetId = uid("preset");
                let createdPageId: Id | null = null;

                applyDoc(doc => {
                    // 1) add preset
                    const baseSize = PAPER_SIZES[draft.paperKey] ?? PAPER_SIZES.A4;
                    const size = draft.orientation === "portrait"
                        ? { width: baseSize.w, height: baseSize.h }
                        : { width: baseSize.h, height: baseSize.w };

                    const base: PagePreset = {
                        id: presetId,
                        name: draft.name,
                        size,
                        margin: { top: 10, right: 10, bottom: 10, left: 10 },
                        source: "custom",
                        locked: false,
                    };

                    doc.pagePresetsById[presetId] = normalizePresetOrientation(base, draft.orientation);
                    if (!doc.pagePresetOrder.includes(presetId)) doc.pagePresetOrder.push(presetId);

                    // 2) ensure HF
                    Cmd.ensureHeaderFooter(doc, presetId);

                    // 3) optionally bootstrap first page
                    if (bootstrap && doc.pageOrder.length === 0) {
                        createdPageId = uid("page");
                        doc.pageOrder.push(createdPageId);
                        doc.pagesById[createdPageId] = { id: createdPageId, presetId, name: "Page 1", visible: true, locked: false };
                        doc.nodeOrderByPageId[createdPageId] = [];
                    }
                });

                if (createdPageId) applySession(s => ({ ...s, activePageId: createdPageId }));
                return createdPageId;
            },


            updatePreset: (presetId, patch) => {
                applyDoc(draft => {
                    const p = draft.pagePresetsById[presetId];
                    if (!p || p.locked) return;

                    let nextP: PagePreset = { ...p };

                    if (patch.name) {
                        const nn = patch.name.trim();
                        if (nn) nextP.name = nn;
                    }

                    if (patch.size) {
                        nextP.size = { ...nextP.size, ...patch.size };
                        nextP.source = nextP.source ?? "custom";
                    }

                    if (patch.orientation) {
                        nextP = normalizePresetOrientation(nextP, patch.orientation);
                    }

                    draft.pagePresetsById[presetId] = nextP;
                });
            },
            deletePresetAndReassignPages: (presetId, opts) => {
                const map = opts.reassignMap || {};

                applyDoc(draft => {
                    // 1) reassign pages
                    for (const [pageId, nextPresetId] of Object.entries(map) as Array<[Id, Id]>) {
                        const page = draft.pagesById[pageId];
                        if (!page) continue;
                        if (page.presetId !== presetId) continue;

                        Cmd.ensureHeaderFooter(draft, nextPresetId);
                        draft.pagesById[pageId] = { ...page, presetId: nextPresetId };
                    }

                    // 2) delete preset
                    delete draft.pagePresetsById[presetId];
                    draft.pagePresetOrder = draft.pagePresetOrder.filter(id => id !== presetId);

                    // 3) (optional) delete HF of removed preset
                    if (draft.headerFooterByPresetId) {
                        delete draft.headerFooterByPresetId[presetId];
                    }
                });

                // 4) session safety (ของมึงใช้ได้อยู่)
                setSession(s => s);
            },

            getNodesByTarget: (pageId, target) => Sel.getNodesByTarget(doc, pageId, target),
            setPresetHeaderHeightPx: (presetId, heightPx) => {
                applyDoc(draft => {
                    const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
                    hf.header.heightPx = heightPx;
                });
            },

            setPresetFooterHeightPx: (presetId, heightPx) => {
                applyDoc(draft => {
                    const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
                    hf.footer.heightPx = heightPx;
                });
            },

            setPageHeaderFooterHidden: (pageId, patch) => {
                applyDoc(draft => {
                    const p = draft.pagesById?.[pageId];
                    if (!p) return;

                    draft.pagesById[pageId] = { ...p, ...patch };
                });
            },

            updateRepeatAreaHeightPx: (presetId, kind, heightPx) => {
                applyDoc(draft => {
                    const hf = Cmd.ensureHFCloneForPreset(draft, presetId);
                    const area = kind === "header" ? hf.header : hf.footer;

                    const minH = area.minHeightPx ?? 0;
                    const maxH = area.maxHeightPx ?? Infinity;
                    const clamped = Math.max(minH, Math.min(maxH, Math.round(heightPx)));

                    if (kind === "header") hf.header.heightPx = clamped;
                    else hf.footer.heightPx = clamped;
                });
            },

        };
    }, [doc, history]);

    return (
        <DocCtx.Provider value={docStore}>
            <SessionCtx.Provider value={sessionStore}>{children}</SessionCtx.Provider>
        </DocCtx.Provider>
    );
}

export function useEditorStore() {
    const docStore = useContext(DocCtx);
    const sessionStore = useContext(SessionCtx);
    if (!docStore || !sessionStore) throw new Error("useEditorStore must be used within EditorStoreProvider");

    // Backward compatible merged shape.
    // Prefer useEditorDocStore/useEditorSessionStore for finer rerender control.
    return useMemo(
        () => ({
            ...docStore,
            ...sessionStore,
        }),
        [docStore, sessionStore]
    );
}

export function useEditorDocStore() {
    const v = useContext(DocCtx);
    if (!v) throw new Error("useEditorDocStore must be used within EditorStoreProvider");
    return v;
}
export function useEditorSessionStore() {
    const v = useContext(SessionCtx);
    if (!v) throw new Error("useEditorSessionStore must be used within EditorStoreProvider");
    return v;
}