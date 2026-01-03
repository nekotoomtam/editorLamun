"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { DocumentJson, Id, NodeJson, PagePreset } from "../../editor-core/schema";
import { normalizePresetOrientation } from "../../editor-core/schema";
import type { EditorSession } from "../../editor-core/editorSession";
import * as Sel from "../../editor-core/schema/selectors";
import * as Cmd from "../../editor-core/commands/docCommands";

type PaperKey = "A4" | "A3" | "LETTER" | "LEGAL";

const PAPER_SIZES: Record<PaperKey, { w: number; h: number }> = {
    A4: { w: 820, h: 1160 },
    A3: { w: 1160, h: 1640 },
    LETTER: { w: 816, h: 1056 },
    LEGAL: { w: 816, h: 1344 },
};

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
    createPagePreset: (
        draft: { name: string; orientation: "portrait" | "landscape"; paperKey: PaperKey },
        opts?: { bootstrap?: boolean }
    ) => void;
    updatePreset: (
        presetId: Id,
        patch: { name?: string; size?: { width: number; height: number }; orientation?: "portrait" | "landscape" }
    ) => void;
    deletePresetAndReassignPages: (presetId: Id, opts: { reassignMap: Record<Id, Id> }) => void


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
            createPagePreset: (draft, opts) => {
                const bootstrap = !!opts?.bootstrap;

                let createdPageId: Id | null = null;

                setDoc((prev) => {
                    const presetId = uid("preset");

                    const baseSize = PAPER_SIZES[draft.paperKey] ?? PAPER_SIZES.A4;

                    // ทำ size ให้ตรงกับ orientation ที่เลือก
                    const size =
                        draft.orientation === "portrait"
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

                    // กันไว้ เผื่ออนาคต normalizePresetOrientation ทำอย่างอื่นด้วย
                    const oriented = normalizePresetOrientation(base, draft.orientation);

                    const next: DocumentJson = {
                        ...prev,
                        pagePresetOrder: prev.pagePresetOrder.includes(presetId)
                            ? prev.pagePresetOrder
                            : [...prev.pagePresetOrder, presetId],
                        pagePresetsById: {
                            ...prev.pagePresetsById,
                            [presetId]: oriented,
                        },
                    };

                    if (bootstrap && next.pageOrder.length === 0) {
                        createdPageId = uid("page");

                        return {
                            ...next,
                            pageOrder: [createdPageId],
                            pagesById: {
                                ...next.pagesById,
                                [createdPageId]: {
                                    id: createdPageId,
                                    presetId,
                                    name: "Page 1",
                                    visible: true,
                                    locked: false,
                                },
                            },
                            nodeOrderByPageId: {
                                ...next.nodeOrderByPageId,
                                [createdPageId]: [],
                            },
                        };
                    }

                    return next;
                });

                if (createdPageId) {
                    setSession((s) => ({ ...s, activePageId: createdPageId }));
                }
            },

            updatePreset: (presetId, patch) => {
                setDoc((prev) => {
                    const p = prev.pagePresetsById[presetId];
                    if (!p) return prev;

                    // locked กันแก้ (เหมือนที่ modal disable แต่กันอีกชั้น)
                    if (p.locked) return prev;

                    let nextP: PagePreset = { ...p };

                    if (patch.name) {
                        const nn = patch.name.trim();
                        if (nn) nextP.name = nn;
                    }

                    if (patch.size) {
                        nextP.size = { ...nextP.size, ...patch.size };
                        nextP.source = nextP.source ?? "custom";
                    }

                    // orientation: normalize (สลับ width/height ให้ถูก)
                    if (patch.orientation) {
                        nextP = normalizePresetOrientation(nextP, patch.orientation);
                    }

                    return {
                        ...prev,
                        pagePresetsById: {
                            ...prev.pagePresetsById,
                            [presetId]: nextP,
                        },
                    };
                });
            },

            deletePresetAndReassignPages: (presetId, opts) => {
                const map = opts.reassignMap || {};

                setDoc((prev) => {
                    const pagesById = { ...prev.pagesById };

                    // 1) reassign pages (immutable per page)
                    for (const [pageId, nextPresetId] of Object.entries(map) as Array<[Id, Id]>) {
                        const page = pagesById[pageId];
                        if (!page) continue;
                        if (page.presetId !== presetId) continue;

                        pagesById[pageId] = { ...page, presetId: nextPresetId };
                    }

                    // 2) delete preset
                    const pagePresetsById = { ...prev.pagePresetsById };
                    delete pagePresetsById[presetId];

                    const pagePresetOrder = prev.pagePresetOrder.filter((id) => id !== presetId);

                    return {
                        ...prev,
                        pagesById,
                        pagePresetsById,
                        pagePresetOrder,
                    };
                });

                // 3) safety: ถ้า active page ยังชี้ preset ที่ถูกลบ -> พยายามใช้ map หรือ fallback
                setSession((s) => {
                    const ap = s.activePageId;
                    if (!ap) return s;

                    const nextPresetId = map[ap]; // ถ้า active page อยู่ใน map จะได้ตัวนี้
                    if (nextPresetId) return s;   // preset ของ page จะถูกเปลี่ยนแล้ว ไม่ต้องยุ่ง

                    return s;
                });
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
