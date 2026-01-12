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

type SessionOnlyStore = {
    session: EditorSession;
    setActivePage: (id: Id | null) => void;
    setZoom: (z: number) => void;
    setSelectedNodeIds: (ids: Id[]) => void;
    setEditingTarget: (t: "page" | "header" | "footer") => void;
};

const SessionCtx = createContext<SessionOnlyStore | null>(null);


const Ctx = createContext<Store | null>(null);

function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
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

    function ensureHeaderFooterMut(draft: DocumentJson, presetId: Id) {
        draft.headerFooterByPresetId ??= {};
        if (draft.headerFooterByPresetId[presetId]) return;

        draft.headerFooterByPresetId[presetId] = {
            header: { id: `hf-${presetId}-header`, heightPx: 100, nodeOrder: [] },
            footer: { id: `hf-${presetId}-footer`, heightPx: 80, nodeOrder: [] },
        };
    }


    function applyDoc(mut: (draft: DocumentJson) => void) {
        setDoc(prev => {
            const next: DocumentJson = {
                ...prev,
                pagesById: { ...prev.pagesById },
                nodesById: { ...prev.nodesById },
                nodeOrderByPageId: { ...prev.nodeOrderByPageId },
                pagePresetsById: { ...prev.pagePresetsById },
                headerFooterByPresetId: prev.headerFooterByPresetId ? { ...prev.headerFooterByPresetId } : prev.headerFooterByPresetId,
                pageOrder: [...prev.pageOrder],
                pagePresetOrder: [...prev.pagePresetOrder],
            };

            mut(next);
            return next;
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


    function ensureHFCloneForPreset(draft: DocumentJson, presetId: Id) {
        ensureHeaderFooterMut(draft, presetId);

        const hfBy = draft.headerFooterByPresetId!;
        const hf = hfBy[presetId]!;

        hfBy[presetId] = {
            header: { ...hf.header, nodeOrder: [...(hf.header.nodeOrder ?? [])] },
            footer: { ...hf.footer, nodeOrder: [...(hf.footer.nodeOrder ?? [])] },
        };

        return hfBy[presetId]!;
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

                    ensureHeaderFooterMut(draft, presetId);
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

                    const preset = draft.pagePresetsById[page.presetId];
                    if (!preset) return;

                    if (source === "page") {
                        draft.pagesById[pageId] = {
                            ...page,
                            marginSource: "page",
                            pageMargin: page.pageMargin ?? { ...preset.margin },
                        };
                    } else {
                        draft.pagesById[pageId] = {
                            ...page,
                            marginSource: "preset",
                            // จะล้าง pageMargin ทิ้งก็ได้ ถ้าต้องการลด state
                            // pageMargin: undefined,
                        };
                    }
                });
            },

            updatePageMargin: (pageId, patch) => {
                applyDoc(draft => {
                    const page = draft.pagesById[pageId];
                    if (!page) return;

                    const base =
                        page.pageMargin ??
                        draft.pagePresetsById[page.presetId]?.margin ??
                        { top: 0, right: 0, bottom: 0, left: 0 };

                    draft.pagesById[pageId] = {
                        ...page,
                        marginSource: (page.marginSource ?? "page"),
                        pageMargin: { ...base, ...patch },
                    };
                });
            },

            updatePresetMargin: (presetId, patch) => {
                applyDoc(draft => {
                    const p = draft.pagePresetsById[presetId];
                    if (!p || p.locked) return;

                    draft.pagePresetsById[presetId] = {
                        ...p,
                        margin: { ...p.margin, ...patch },
                        source: p.source ?? "custom",
                    };
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
                    ensureHeaderFooterMut(doc, presetId);

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

                        ensureHeaderFooterMut(draft, nextPresetId);
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

            setEditingTarget: (t) =>
                setSession((s) => ({
                    ...s,
                    editingTarget: t,
                    selectedNodeIds: [],
                    hoverNodeId: null,
                })),

            getNodesByTarget: (pageId, target) => Sel.getNodesByTarget(doc, pageId, target),
            setPresetHeaderHeightPx: (presetId, heightPx) => {
                applyDoc(draft => {
                    const hf = ensureHFCloneForPreset(draft, presetId);
                    hf.header.heightPx = heightPx;
                });
            },

            setPresetFooterHeightPx: (presetId, heightPx) => {
                applyDoc(draft => {
                    const hf = ensureHFCloneForPreset(draft, presetId);
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
                    const hf = ensureHFCloneForPreset(draft, presetId);
                    const area = kind === "header" ? hf.header : hf.footer;

                    const minH = area.minHeightPx ?? 0;
                    const maxH = area.maxHeightPx ?? Infinity;
                    const clamped = Math.max(minH, Math.min(maxH, Math.round(heightPx)));

                    if (kind === "header") hf.header.heightPx = clamped;
                    else hf.footer.heightPx = clamped;
                });
            },

        };
    }, [doc, session]);

    return (
        <Ctx.Provider value={store}>
            <SessionCtx.Provider value={sessionStore}>
                {children}
            </SessionCtx.Provider>
        </Ctx.Provider>
    );
}

export function useEditorStore() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useEditorStore must be used within EditorStoreProvider");
    return v;
}
export function useEditorSessionStore() {
    const v = useContext(SessionCtx);
    if (!v) throw new Error("useEditorSessionStore must be used within EditorStoreProvider");
    return v;
}