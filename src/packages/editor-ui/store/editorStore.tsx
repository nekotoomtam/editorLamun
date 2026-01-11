"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { DocumentJson, Id, NodeJson, PageJson, PagePreset } from "../../editor-core/schema";
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
    setEditingTarget: (t: "page" | "header" | "footer") => void;
    getNodesByTarget: (
        pageId: Id,
        target: "page" | "header" | "footer"
    ) => { nodesById: Record<Id, NodeJson>; nodeOrder: Id[] };
    setPresetHeaderHeightPx: (presetId: Id, heightPx: number) => void;
    setPresetFooterHeightPx: (presetId: Id, heightPx: number) => void;
    setPageHeaderFooterHidden: (pageId: Id, patch: { headerHidden?: boolean; footerHidden?: boolean }) => void;
    updateRepeatAreaHeightPx: (presetId: Id, kind: "header" | "footer", heightPx: number) => void;

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

function cloneDocForAddNode(doc: DocumentJson, pageId: Id, target: "page" | "header" | "footer") {
    // Phase-1: nodes are always global
    if (target === "page") {
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

    const page = doc.pagesById?.[pageId];
    const presetId = page?.presetId;
    if (!presetId) return { ...doc };

    const hfMap = doc.headerFooterByPresetId ?? {};
    const prevHF = hfMap[presetId];

    const nextHF = prevHF
        ? {
            header: {
                ...prevHF.header,
                nodeOrder: [...(prevHF.header.nodeOrder ?? [])],
            },
            footer: {
                ...prevHF.footer,
                nodeOrder: [...(prevHF.footer.nodeOrder ?? [])],
            },
        }
        : undefined;

    return {
        ...doc,
        nodesById: { ...doc.nodesById },
        headerFooterByPresetId: {
            ...hfMap,
            ...(nextHF ? { [presetId]: nextHF } : {}),
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
    function migrateInlineHeaderFooterNodes(d: DocumentJson): DocumentJson {
        const hfBy = d.headerFooterByPresetId;
        if (!hfBy) return d;

        let changed = false;
        const nodesById = { ...(d.nodesById ?? {}) };
        const nextHF: NonNullable<DocumentJson["headerFooterByPresetId"]> = { ...hfBy };

        for (const presetId of Object.keys(nextHF)) {
            const hf = nextHF[presetId];
            if (!hf) continue;

            const zones: Array<["header" | "footer", any]> = [
                ["header", hf.header],
                ["footer", hf.footer],
            ];

            for (const [kind, zone] of zones) {
                const inline = zone?.nodesById;
                if (!inline || Object.keys(inline).length === 0) continue;

                changed = true;
                for (const id of Object.keys(inline)) {
                    const n = inline[id];
                    if (!n) continue;
                    // Ensure owner exists (Phase-1)
                    const owner = (n as any).owner ?? { kind, presetId };
                    nodesById[id] = { ...(n as any), owner };
                }

                // Remove inline storage; keep ordering only
                zone.nodesById = undefined;
            }
        }

        if (!changed) return d;
        return { ...d, nodesById, headerFooterByPresetId: nextHF };
    }

    function bootstrapAllPresetHF(d: DocumentJson) {
        let next = migrateInlineHeaderFooterNodes(d);
        for (const presetId of next.pagePresetOrder ?? []) {
            next = ensureHeaderFooter(next, presetId);
        }
        return next;
    }

    const [doc, setDoc] = useState<DocumentJson>(() => bootstrapAllPresetHF(initialDoc));


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
    function ensureHeaderFooter(doc: DocumentJson, presetId: Id) {
        const hfBy = doc.headerFooterByPresetId ?? {};
        if (hfBy[presetId]) return doc;

        return {
            ...doc,
            headerFooterByPresetId: {
                ...hfBy,
                [presetId]: {
                    header: {
                        id: `hf-${presetId}-header`,
                        heightPx: 100,          // ✅ default B
                        nodeOrder: [],
                    },
                    footer: {
                        id: `hf-${presetId}-footer`,
                        heightPx: 80,           // ✅ default B
                        nodeOrder: [],
                    },
                },
            },
        };
    }



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
                    const target = session.editingTarget ?? "page";
                    const next = cloneDocForAddNode(prev, pageId, target);
                    Cmd.addNodeToTarget(next, pageId, target, node);
                    return next;
                });
            },

            // page actions
            addPageToEnd: () => {
                const newPageId = uid("page");

                setDoc((prev) => {
                    const lastPageId = prev.pageOrder[prev.pageOrder.length - 1];
                    const lastPage = lastPageId ? prev.pagesById[lastPageId] : null;

                    const presetId =
                        lastPage?.presetId ??
                        prev.pagePresetOrder[0] ??
                        Object.keys(prev.pagePresetsById)[0];

                    if (!presetId) return prev;

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

                setSession((s) => ({ ...s, activePageId: newPageId }));
                return newPageId;
            },


            insertPageAfter: (afterPageId: Id) => {
                const newPageId = uid("page");
                setDoc(prev => {
                    const after = prev.pagesById[afterPageId];
                    if (!after) return prev;
                    const idx = prev.pageOrder.indexOf(afterPageId);
                    if (idx < 0) return prev;

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
                            [newPageId]: { id: newPageId, presetId: after.presetId, name: undefined, visible: true, locked: false },
                        },
                        nodeOrderByPageId: { ...prev.nodeOrderByPageId, [newPageId]: [] },
                    };
                });

                setSession(s => ({ ...s, activePageId: newPageId }));
                return newPageId;
            },

            deletePage: (pageId: Id) => {
                if (!pageId) return;

                let didDelete = false;
                let deletedNodeIds: Id[] = [];
                let nextOrder: Id[] = [];

                setDoc((prev) => {
                    const order = prev.pageOrder ?? [];
                    if (order.length <= 1) return prev;

                    const idx = order.indexOf(pageId);
                    if (idx < 0) return prev;
                    if (!prev.pagesById[pageId]) return prev;

                    nextOrder = order.filter((id) => id !== pageId);

                    const pagesById = { ...prev.pagesById };
                    delete pagesById[pageId];

                    deletedNodeIds = prev.nodeOrderByPageId[pageId] ?? [];

                    const nodeOrderByPageId = { ...prev.nodeOrderByPageId };
                    delete nodeOrderByPageId[pageId];

                    let nodesById = prev.nodesById;
                    if (deletedNodeIds.length) {
                        nodesById = { ...prev.nodesById };
                        for (const nid of deletedNodeIds) delete nodesById[nid];
                    }

                    didDelete = true;

                    return { ...prev, pageOrder: nextOrder, pagesById, nodeOrderByPageId, nodesById };
                });

                if (!didDelete) return;

                setSession((s) => {
                    const isDeletingActive = s.activePageId === pageId;

                    // ลบ active: ไปก่อนหน้าเป็นหลัก
                    let nextActiveId = s.activePageId;
                    if (isDeletingActive) {
                        const idx = (doc.pageOrder ?? []).indexOf(pageId); // ถ้าจะชัวร์สุด เก็บ order ไว้ใน setDoc เหมือน nextOrder
                        const prevId = (doc.pageOrder ?? [])[idx - 1] ?? null;
                        nextActiveId = prevId ?? nextOrder[0] ?? null;

                        return { ...s, activePageId: nextActiveId, selectedNodeIds: [], hoverNodeId: null };
                    }

                    // ลบ non-active: filter selection เฉพาะ node ที่หายไป
                    const filtered = s.selectedNodeIds.filter((id) => !deletedNodeIds.includes(id));
                    const hover = s.hoverNodeId && deletedNodeIds.includes(s.hoverNodeId) ? null : s.hoverNodeId;
                    return { ...s, selectedNodeIds: filtered, hoverNodeId: hover };
                });
            },


            setPagePreset: (pageId, presetId) => {
                setDoc(prev => {
                    const page = prev.pagesById[pageId];
                    if (!page) return prev;
                    return {
                        ...prev,
                        pagesById: {
                            ...prev.pagesById,
                            [pageId]: { ...page, presetId },
                        },
                    };
                });
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

            setPageMarginSource: (pageId, source) => {
                setDoc(prev => {
                    const page = prev.pagesById[pageId];
                    if (!page) return prev;

                    const preset = prev.pagePresetsById[page.presetId];
                    if (!preset) return prev;

                    const nextPage: PageJson =
                        source === "page"
                            ? {
                                ...page,
                                marginSource: "page",
                                pageMargin: page.pageMargin ?? { ...preset.margin },
                            }
                            : {
                                ...page,
                                marginSource: "preset",
                            };

                    return {
                        ...prev,
                        pagesById: {
                            ...prev.pagesById,
                            [pageId]: nextPage,
                        },
                    };
                });
            },
            updatePageMargin: (pageId, patch) => {
                setDoc(prev => {
                    const page = prev.pagesById[pageId];
                    if (!page) return prev;

                    const base =
                        page.pageMargin ??
                        prev.pagePresetsById[page.presetId]?.margin ??
                        { top: 0, right: 0, bottom: 0, left: 0 };

                    const nextPage: PageJson = {
                        ...page,
                        marginSource: (page.marginSource ?? "page"),
                        pageMargin: { ...base, ...patch },
                    };

                    return {
                        ...prev,
                        pagesById: {
                            ...prev.pagesById,
                            [pageId]: nextPage,
                        },
                    };
                });
            },

            updatePresetMargin: (presetId, patch) => {
                setDoc(prev => {
                    const p = prev.pagePresetsById[presetId];
                    if (!p) return prev;

                    // ถ้าจะกัน locked ซ้ำก็ใส่ได้
                    if (p.locked) return prev;

                    return {
                        ...prev,
                        pagePresetsById: {
                            ...prev.pagePresetsById,
                            [presetId]: {
                                ...p,
                                margin: { ...p.margin, ...patch },
                                source: p.source ?? "custom",
                            },
                        },
                    };
                });
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
                    const nextWithHF = ensureHeaderFooter(next, presetId);

                    if (bootstrap && next.pageOrder.length === 0) {
                        createdPageId = uid("page");

                        return {
                            ...nextWithHF,
                            pageOrder: [createdPageId],
                            pagesById: {
                                ...nextWithHF.pagesById,
                                [createdPageId]: {
                                    id: createdPageId,
                                    presetId,
                                    name: "Page 1",
                                    visible: true,
                                    locked: false,
                                },
                            },
                            nodeOrderByPageId: {
                                ...nextWithHF.nodeOrderByPageId,
                                [createdPageId]: [],
                            },
                        };
                    }

                    return nextWithHF;

                });

                if (createdPageId) {
                    setSession((s) => ({ ...s, activePageId: createdPageId }));
                }

                return createdPageId;
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


            setEditingTarget: (t) =>
                setSession((s) => ({
                    ...s,
                    editingTarget: t,
                    selectedNodeIds: [],
                    hoverNodeId: null,
                })),

            getNodesByTarget: (pageId, target) => Sel.getNodesByTarget(doc, pageId, target),
            setPresetHeaderHeightPx: (presetId, heightPx) => {
                setDoc((prev) => {
                    let next = ensureHeaderFooter(prev, presetId);
                    const hf = next.headerFooterByPresetId?.[presetId];
                    if (!hf) return next;

                    return {
                        ...next,
                        headerFooterByPresetId: {
                            ...(next.headerFooterByPresetId ?? {}),
                            [presetId]: {
                                ...hf,
                                header: {
                                    ...hf.header,
                                    heightPx,
                                },
                            },
                        },
                    };
                });
            },

            setPresetFooterHeightPx: (presetId, heightPx) => {
                setDoc((prev) => {
                    let next = ensureHeaderFooter(prev, presetId);
                    const hf = next.headerFooterByPresetId?.[presetId];
                    if (!hf) return next;

                    return {
                        ...next,
                        headerFooterByPresetId: {
                            ...(next.headerFooterByPresetId ?? {}),
                            [presetId]: {
                                ...hf,
                                footer: {
                                    ...hf.footer,
                                    heightPx,
                                },
                            },
                        },
                    };
                });
            },

            setPageHeaderFooterHidden: (pageId, patch) => {
                setDoc((prev) => {
                    const p = prev.pagesById?.[pageId];
                    if (!p) return prev;

                    return {
                        ...prev,
                        pagesById: {
                            ...prev.pagesById,
                            [pageId]: {
                                ...p,
                                ...patch,
                            },
                        },
                    };
                });
            },
            updateRepeatAreaHeightPx: (presetId, kind, heightPx) => {
                setDoc((prev) => {
                    let next = ensureHeaderFooter(prev, presetId);
                    const hf = next.headerFooterByPresetId?.[presetId];
                    if (!hf) return next;

                    const area = kind === "header" ? hf.header : hf.footer;

                    const minH = area.minHeightPx ?? 0;
                    const maxH = area.maxHeightPx ?? Infinity;

                    const clamped = Math.max(minH, Math.min(maxH, Math.round(heightPx)));

                    return {
                        ...next,
                        headerFooterByPresetId: {
                            ...(next.headerFooterByPresetId ?? {}),
                            [presetId]: {
                                ...hf,
                                header:
                                    kind === "header"
                                        ? { ...hf.header, heightPx: clamped }
                                        : hf.header,
                                footer:
                                    kind === "footer"
                                        ? { ...hf.footer, heightPx: clamped }
                                        : hf.footer,
                            },
                        },
                    };
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

