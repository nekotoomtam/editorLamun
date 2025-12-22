"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { DocumentJson, Id, NodeJson, PagePreset } from "../../editor-core/schema";
import { normalizePresetOrientation } from "../../editor-core/schema";
import type { EditorSession } from "../../editor-core/editorSession";
import * as Sel from "../../editor-core/schema/selectors";
import * as Cmd from "../../editor-core/commands/docCommands";


type Store = {
    doc: DocumentJson;
    session: EditorSession;

    // selectors
    getPages: () => ReturnType<typeof Sel.getPages>;
    getPage: (id: Id | null) => ReturnType<typeof Sel.getPage>;
    getPageNodes: (pageId: Id) => ReturnType<typeof Sel.getPageNodes>;

    // session actions
    setActivePage: (id: Id | null) => void;
    setZoom: (z: number) => void;
    setSelectedNodeIds: (ids: Id[]) => void;

    // doc actions
    updateNode: (nodeId: Id, patch: Partial<NodeJson>) => void;
    addNode: (pageId: Id, node: NodeJson) => void;

    // page actions
    addPageToEnd: () => void;
    insertPageAfter: (afterPageId: Id) => void;
    deleteActivePage: () => void;

    setPagePreset: (pageId: Id, presetId: Id) => void;
    updatePresetSize: (presetId: Id, patch: Partial<PagePreset["size"]>) => void;
    updatePresetMargin: (presetId: Id, patch: Partial<PagePreset["margin"]>) => void;
    setPresetOrientation: (presetId: Id, mode: "portrait" | "landscape") => void;

};

const Ctx = createContext<Store | null>(null);

function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneDocForUpdateNode(doc: DocumentJson) {
    return {
        ...doc,
        nodesById: { ...doc.nodesById },
    };
}

function cloneDocForAddNode(doc: DocumentJson, pageId: Id) {
    const prevOrder = doc.nodeOrderByPageId[pageId] ?? [];
    return {
        ...doc,
        nodesById: { ...doc.nodesById },
        nodeOrderByPageId: {
            ...doc.nodeOrderByPageId,
            [pageId]: [...prevOrder],
        },
    };
}

export function EditorStoreProvider({
    initialDoc,
    children,
}: {
    initialDoc: DocumentJson;
    children: React.ReactNode;
}) {
    const [doc, setDoc] = useState<DocumentJson>(initialDoc);

    const [session, setSession] = useState<EditorSession>({
        activePageId: initialDoc.pageOrder[0] ?? null,
        zoom: 1,
        selectedNodeIds: [],
        hoverNodeId: null,
        tool: "select",
        drag: null,
        resize: null,
    });

    const store = useMemo<Store>(() => {
        return {
            doc,
            session,

            // selectors
            getPages: () => Sel.getPages(doc),
            getPage: (id) => Sel.getPage(doc, id),
            getPageNodes: (pageId) => Sel.getPageNodes(doc, pageId),

            // session actions
            setActivePage: (id) => setSession((s) => ({ ...s, activePageId: id })),
            setZoom: (z) => setSession((s) => ({ ...s, zoom: z })),
            setSelectedNodeIds: (ids) => setSession((s) => ({ ...s, selectedNodeIds: ids })),

            // doc actions
            updateNode: (nodeId, patch) => {
                setDoc((prev) => {
                    const next = cloneDocForUpdateNode(prev);
                    Cmd.updateNode(next, nodeId, patch);
                    return next;
                });
            },

            addNode: (pageId, node) => {
                setDoc((prev) => {
                    const next = cloneDocForAddNode(prev, pageId);
                    Cmd.addNode(next, pageId, node);
                    return next;
                });
            },

            // page actions
            addPageToEnd: () => {
                let newPageId: Id | null = null;

                setDoc((prev) => {
                    const lastPageId = prev.pageOrder[prev.pageOrder.length - 1];
                    const lastPage = lastPageId ? prev.pagesById[lastPageId] : null;

                    const presetId =
                        lastPage?.presetId ??
                        prev.pagePresetOrder[0] ??
                        Object.keys(prev.pagePresetsById)[0];

                    if (!presetId) return prev;

                    newPageId = uid("page");
                    const nextPageOrder = [...prev.pageOrder, newPageId];

                    return {
                        ...prev,
                        pageOrder: nextPageOrder,
                        pagesById: {
                            ...prev.pagesById,
                            [newPageId]: {
                                id: newPageId,
                                presetId,
                                name: `Page ${nextPageOrder.length}`,
                                visible: true,
                                locked: false,
                            },
                        },
                        nodeOrderByPageId: {
                            ...prev.nodeOrderByPageId,
                            [newPageId]: [],
                        },
                    };
                });

                if (newPageId) {
                    setSession((s) => ({ ...s, activePageId: newPageId }));
                }
            },

            insertPageAfter: (afterPageId: Id) => {
                let newPageId: Id | null = null;

                setDoc((prev) => {
                    const after = prev.pagesById[afterPageId];
                    if (!after) return prev;

                    const idx = prev.pageOrder.indexOf(afterPageId);
                    if (idx < 0) return prev;

                    newPageId = uid("page");
                    const nextPageOrder = [
                        ...prev.pageOrder.slice(0, idx + 1),
                        newPageId,
                        ...prev.pageOrder.slice(idx + 1),
                    ];

                    return {
                        ...prev,
                        pageOrder: nextPageOrder,
                        pagesById: {
                            ...prev.pagesById,
                            [newPageId]: {
                                id: newPageId,
                                presetId: after.presetId,
                                name: `Page ${idx + 2}`,
                                visible: true,
                                locked: false,
                            },
                        },
                        nodeOrderByPageId: {
                            ...prev.nodeOrderByPageId,
                            [newPageId]: [],
                        },
                    };
                });

                if (newPageId) {
                    setSession((s) => ({ ...s, activePageId: newPageId }));
                }
            },

            deleteActivePage: () => {
                const targetId = session.activePageId;
                if (!targetId) return;
                if ((doc.pageOrder?.length ?? 0) <= 1) return;

                // คำนวณ nextActive จาก state ปัจจุบัน (ก่อน setDoc)
                const order = doc.pageOrder ?? [];
                const idx = order.indexOf(targetId);
                if (idx < 0) return;

                const nextOrder = order.filter((id) => id !== targetId);
                const nextActiveId =
                    nextOrder[Math.min(idx, nextOrder.length - 1)] ?? nextOrder[0] ?? null;

                setDoc((prev) => {
                    const pagesById = { ...prev.pagesById };
                    delete pagesById[targetId];

                    const nodeOrderByPageId = { ...prev.nodeOrderByPageId };
                    delete nodeOrderByPageId[targetId];

                    return {
                        ...prev,
                        pageOrder: nextOrder,
                        pagesById,
                        nodeOrderByPageId,
                    };
                });

                setSession((s) => ({ ...s, activePageId: nextActiveId }));
            },
            setPagePreset: (pageId, presetId) => {
                setDoc(prev => ({
                    ...prev,
                    pagesById: {
                        ...prev.pagesById,
                        [pageId]: {
                            ...prev.pagesById[pageId],
                            presetId,
                        },
                    },
                }));
            },

            updatePresetSize: (presetId, patch) => {
                setDoc(prev => ({
                    ...prev,
                    pagePresetsById: {
                        ...prev.pagePresetsById,
                        [presetId]: {
                            ...prev.pagePresetsById[presetId],
                            size: { ...prev.pagePresetsById[presetId].size, ...patch },
                            source: prev.pagePresetsById[presetId].source ?? "custom",
                        },
                    },
                }));
            },

            updatePresetMargin: (presetId, patch) => {
                setDoc(prev => ({
                    ...prev,
                    pagePresetsById: {
                        ...prev.pagePresetsById,
                        [presetId]: {
                            ...prev.pagePresetsById[presetId],
                            margin: { ...prev.pagePresetsById[presetId].margin, ...patch },
                            source: prev.pagePresetsById[presetId].source ?? "custom",
                        },
                    },
                }));
            },

            setPresetOrientation: (presetId, mode) => {
                setDoc(prev => ({
                    ...prev,
                    pagePresetsById: {
                        ...prev.pagePresetsById,
                        [presetId]: normalizePresetOrientation(prev.pagePresetsById[presetId], mode),
                    },
                }));
            },

        };
    }, [doc, session]);

    return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useEditorStore() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useEditorStore must be used within EditorStoreProvider");
    return v;
}
