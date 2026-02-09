"use client";

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { createDocHistoryHelpers, createInitialHistory, type DocHistoryState } from "./docHistory";
import { createId, DOC_VERSION_LATEST, type DocumentJson, type Id, type NodeJson, type PagePreset } from "../../editor-core/schema";
import { createInitialSession, createSessionStore, type SessionOnlyStore } from "./sessionStore";
import { createDocPresetsActions } from "./docPresetsActions";
import { createDocPagesActions } from "./docPagesActions";
import { bootstrapAllPresetHF } from "./editorBootstrap";
import { runNormalizeDocToPtSelfTest } from "../dev/normalizeDocToPtSelfTest";
import { createDocHfActions } from "./docHfActions";
import type { EditorSession } from "../../editor-core/editorSession";
import type { PaperKey } from "./paperSizes";
import * as Sel from "../../editor-core/schema/selectors";
import * as Cmd from "../../editor-core/commands/docCommands";
import { normalizeDocToPt } from "../../editor-core/commands/normalize";

const __DEV__ = process.env.NODE_ENV !== "production";
let __didRunMigrationSelfTest = false;

function assertDocInvariant(doc: DocumentJson) {
    if (doc.version !== DOC_VERSION_LATEST) {
        throw new Error(`Invariant: doc.version (${doc.version}) must be migrated to ${DOC_VERSION_LATEST} before use.`);
    }

    for (const presetId of doc.pagePresetOrder ?? []) {
        if (!doc.pagePresetsById?.[presetId]) {
            throw new Error(`Invariant: pagePresetOrder references missing preset ${presetId}.`);
        }
    }

    for (const pageId of doc.pageOrder ?? []) {
        if (!doc.pagesById?.[pageId]) {
            throw new Error(`Invariant: pageOrder references missing page ${pageId}.`);
        }
    }

    for (const [pageId, order] of Object.entries(doc.nodeOrderByPageId ?? {})) {
        if (!doc.pagesById?.[pageId]) {
            throw new Error(`Invariant: nodeOrderByPageId references missing page ${pageId}.`);
        }
        for (const nodeId of order ?? []) {
            if (!doc.nodesById?.[nodeId]) {
                throw new Error(`Invariant: nodeOrderByPageId references missing node ${nodeId}.`);
            }
        }
    }

    for (const [presetId, hf] of Object.entries(doc.headerFooterByPresetId ?? {})) {
        if (!doc.pagePresetsById?.[presetId]) {
            throw new Error(`Invariant: headerFooterByPresetId references missing preset ${presetId}.`);
        }
        for (const nodeId of hf.header?.nodeOrder ?? []) {
            if (!doc.nodesById?.[nodeId]) {
                throw new Error(`Invariant: header nodeOrder references missing node ${nodeId}.`);
            }
        }
        for (const nodeId of hf.footer?.nodeOrder ?? []) {
            if (!doc.nodesById?.[nodeId]) {
                throw new Error(`Invariant: footer nodeOrder references missing node ${nodeId}.`);
            }
        }
    }
}

function assertSelectionInvariant(doc: DocumentJson, session: EditorSession) {
    if (session.activePageId && !doc.pagesById?.[session.activePageId]) {
        throw new Error(`Invariant: activePageId references missing page ${session.activePageId}.`);
    }
    if (session.hoverNodeId && !doc.nodesById?.[session.hoverNodeId]) {
        throw new Error(`Invariant: hoverNodeId references missing node ${session.hoverNodeId}.`);
    }
    for (const id of session.selectedNodeIds ?? []) {
        if (!doc.nodesById?.[id]) {
            throw new Error(`Invariant: selectedNodeIds references missing node ${id}.`);
        }
    }
}

function assertFiniteGeometry(doc: DocumentJson) {
    const isFiniteNumber = (v: number) => Number.isFinite(v);

    for (const preset of Object.values(doc.pagePresetsById ?? {})) {
        if (!isFiniteNumber(preset.size.width) || !isFiniteNumber(preset.size.height)) {
            throw new Error("Invariant: preset size must be finite numbers.");
        }
        const m = preset.margin;
        if (!isFiniteNumber(m.top) || !isFiniteNumber(m.right) || !isFiniteNumber(m.bottom) || !isFiniteNumber(m.left)) {
            throw new Error("Invariant: preset margin must be finite numbers.");
        }
    }

    for (const page of Object.values(doc.pagesById ?? {})) {
        const m = page.marginOverride;
        if (m) {
            if (!isFiniteNumber(m.top) || !isFiniteNumber(m.right) || !isFiniteNumber(m.bottom) || !isFiniteNumber(m.left)) {
                throw new Error("Invariant: page marginOverride must be finite numbers.");
            }
        }
    }

    for (const node of Object.values(doc.nodesById ?? {})) {
        if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y) || !isFiniteNumber(node.w) || !isFiniteNumber(node.h)) {
            throw new Error("Invariant: node geometry must be finite numbers.");
        }
        if (node.type === "text") {
            const st: any = node.style;
            if (!isFiniteNumber(st.fontSize) || !isFiniteNumber(st.lineHeight)) {
                throw new Error("Invariant: text style geometry must be finite numbers.");
            }
            if (st.letterSpacing !== undefined && !isFiniteNumber(st.letterSpacing)) {
                throw new Error("Invariant: text letterSpacing must be finite numbers.");
            }
        }
        if (node.type === "box") {
            const st: any = node.style;
            if (st.strokeWidth !== undefined && !isFiniteNumber(st.strokeWidth)) {
                throw new Error("Invariant: box strokeWidth must be finite numbers.");
            }
            if (st.radius !== undefined && !isFiniteNumber(st.radius)) {
                throw new Error("Invariant: box radius must be finite numbers.");
            }
        }
    }

    for (const hf of Object.values(doc.headerFooterByPresetId ?? {})) {
        const areas = [hf.header, hf.footer];
        for (const area of areas) {
            if (area.heightPt !== undefined && !isFiniteNumber(area.heightPt)) {
                throw new Error("Invariant: header/footer heightPt must be finite numbers.");
            }
            if (area.minHeightPt !== undefined && !isFiniteNumber(area.minHeightPt)) {
                throw new Error("Invariant: header/footer minHeightPt must be finite numbers.");
            }
            if (area.maxHeightPt !== undefined && !isFiniteNumber(area.maxHeightPt)) {
                throw new Error("Invariant: header/footer maxHeightPt must be finite numbers.");
            }
        }
    }

    for (const guide of Object.values(doc.guides?.byId ?? {})) {
        if (!isFiniteNumber(guide.pos)) {
            throw new Error("Invariant: guide position must be a finite number.");
        }
    }
}


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

    deletePresetAndReassignPages: (presetId: Id, opts: { reassignMap: Record<Id, Id> }) => void;

    getNodesByTarget: (
        pageId: Id,
        target: "page" | "header" | "footer"
    ) => { nodesById: Record<Id, NodeJson>; nodeOrder: Id[] };

    setPresetHeaderHeightPt: (presetId: Id, heightPt: number) => void;
    setPresetFooterHeightPt: (presetId: Id, heightPt: number) => void;
    setPageHeaderFooterHidden: (pageId: Id, patch: { headerHidden?: boolean; footerHidden?: boolean }) => void;
    updateRepeatAreaHeightPt: (presetId: Id, kind: "header" | "footer", heightPt: number) => void;
    updateRepeatAreaAnchorToMargins: (presetId: Id, kind: "header" | "footer", anchorToMargins: boolean) => void;
};

const SessionCtx = createContext<SessionOnlyStore | null>(null);
const DocCtx = createContext<DocStore | null>(null);

function uid(prefix: string) {
    return createId(prefix);
}

export function EditorStoreProvider({
    initialDoc,
    children,
}: {
    initialDoc: DocumentJson;
    children: React.ReactNode;
}) {
    const initial = useMemo(() => {
        const d = bootstrapAllPresetHF(normalizeDocToPt(initialDoc));
        if (__DEV__) {
            if (process.env.RUN_MIGRATION_SELFTEST === "1" && !__didRunMigrationSelfTest) {
                __didRunMigrationSelfTest = true;
                runNormalizeDocToPtSelfTest();
            }
            if (d.unit !== "pt") {
                throw new Error(`Invariant: doc.unit must be "pt" after migration.`);
            }
            assertFiniteGeometry(d);
        }
        const firstPageId = d.pageOrder?.[0] ?? null;
        return { doc: d, firstPageId };
    }, [initialDoc]);

    const [doc, setDoc] = useState<DocumentJson>(() => initial.doc);
    const [history, setHistory] = useState<DocHistoryState>(() => createInitialHistory());

    const docHistory = useMemo(() => createDocHistoryHelpers({ setDoc, setHistory }), [setDoc, setHistory]);

    const [session, setSession] = useState<EditorSession>(() =>
        createInitialSession(initial.firstPageId)
    );

    const applySession = useCallback((mut: (s: EditorSession) => EditorSession) => {
        setSession(mut);
    }, [setSession])

    const sessionStore = useMemo<SessionOnlyStore>(() => {
        return createSessionStore(session, setSession);
    }, [session]);

    const pagesActions = useMemo(() => {
        return createDocPagesActions({ uid, applyDoc: docHistory.applyDoc, applySession });
    }, [docHistory, applySession]);

    const presetsActions = useMemo(() => {
        return createDocPresetsActions({
            uid,
            applyDoc: docHistory.applyDoc,
            applySession,
        });
    }, [docHistory, applySession]);

    const hfActions = useMemo(() => {
        return createDocHfActions({ applyDoc: docHistory.applyDoc });
    }, [docHistory]);


    useEffect(() => {
        if (!__DEV__) return;

        // heal session refs when doc changes
        const fallbackPageId = doc.pageOrder?.[0] ?? null;

        if (session.activePageId && !doc.pagesById?.[session.activePageId]) {
            setSession(s => ({ ...s, activePageId: fallbackPageId }));
            return; // รอ render รอบถัดไปก่อนค่อย assert อื่น
        }

        if (session.hoverNodeId && !doc.nodesById?.[session.hoverNodeId]) {
            setSession(s => ({ ...s, hoverNodeId: null }));
            return;
        }

        const selected = session.selectedNodeIds ?? [];
        const filtered = selected.filter(id => !!doc.nodesById?.[id]);
        if (filtered.length !== selected.length) {
            setSession(s => ({ ...s, selectedNodeIds: filtered }));
            return;
        }
    }, [doc, session.activePageId, session.hoverNodeId, session.selectedNodeIds]);



    const docStore = useMemo<DocStore>(() => {
        return {
            doc,

            // history
            canUndo: () => docHistory.canUndo(history),
            canRedo: () => docHistory.canRedo(history),
            undo: () => docHistory.undoDoc(),
            redo: () => docHistory.redoDoc(),

            // selectors
            getPages: () => Sel.getPages(doc),
            getPage: (id) => Sel.getPage(doc, id),
            getPageNodes: (pageId) => Sel.getPageNodes(doc, pageId),

            // doc actions
            updateNode: (nodeId, patch) => {
                docHistory.applyDoc((next) => {
                    Cmd.updateNode(next, nodeId, patch);
                });
            },

            addNode: (pageId, node, target) => {
                docHistory.applyDoc((next) => Cmd.addNodeToTarget(next, pageId, target, node));
            },

            // page actions
            addPageToEnd: pagesActions.addPageToEnd,
            insertPageAfter: pagesActions.insertPageAfter,
            deletePage: pagesActions.deletePage,
            setPagePreset: pagesActions.setPagePreset,
            updatePresetSize: presetsActions.updatePresetSize,
            updatePresetMargin: presetsActions.updatePresetMargin,
            setPresetOrientation: presetsActions.setPresetOrientation,
            setPageMarginSource: presetsActions.setPageMarginSource,
            updatePageMargin: presetsActions.updatePageMargin,
            createPagePreset: presetsActions.createPagePreset,
            updatePreset: presetsActions.updatePreset,
            deletePresetAndReassignPages: (presetId, opts) => {
                presetsActions.deletePresetAndReassignPages(presetId, opts);
            },


            getNodesByTarget: (pageId, target) => Sel.getNodesByTarget(doc, pageId, target),

            setPresetHeaderHeightPt: hfActions.setPresetHeaderHeightPt,
            setPresetFooterHeightPt: hfActions.setPresetFooterHeightPt,
            setPageHeaderFooterHidden: hfActions.setPageHeaderFooterHidden,
            updateRepeatAreaHeightPt: hfActions.updateRepeatAreaHeightPt,
            updateRepeatAreaAnchorToMargins: hfActions.updateRepeatAreaAnchorToMargins,
        };
    }, [doc, history, docHistory, pagesActions, presetsActions, hfActions]);

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

    return useMemo(() => ({ ...docStore, ...sessionStore }), [docStore, sessionStore]);
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
