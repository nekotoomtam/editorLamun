"use client";

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { createDocHistoryHelpers, createInitialHistory, type DocHistoryState } from "./docHistory";
import { createId, DOC_VERSION_LATEST, type DocumentJson, type Id, type NodeJson, type PagePreset } from "../../editor-core/schema";
import { createInitialSession, createSessionStore, type SessionOnlyStore } from "./sessionStore";
import { createDocPresetsActions } from "./docPresetsActions";
import { createDocPagesActions } from "./docPagesActions";
import { bootstrapAllPresetHF } from "./editorBootstrap";
import { createDocHfActions } from "./docHfActions";
import type { EditorSession } from "../../editor-core/editorSession";
import type { PaperKey } from "./paperSizes";
import * as Sel from "../../editor-core/schema/selectors";
import * as Cmd from "../../editor-core/commands/docCommands";
import { ptToPt100 } from "../utils/pt100";

const __DEV__ = process.env.NODE_ENV !== "production";

function assertDocInvariant(doc: DocumentJson) {
    if (doc.unit !== "pt") {
        throw new Error(`Invariant: doc.unit must be "pt" (pt100). Got "${doc.unit}".`);
    }

    const assertInt = (path: string, value: number | undefined) => {
        if (value === undefined) return;
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            throw new Error(`Invariant: ${path} must be an integer pt100. Got ${value}.`);
        }
    };

    const assertMargin = (path: string, margin: { top: number; right: number; bottom: number; left: number } | undefined) => {
        if (!margin) return;
        assertInt(`${path}.top`, margin.top);
        assertInt(`${path}.right`, margin.right);
        assertInt(`${path}.bottom`, margin.bottom);
        assertInt(`${path}.left`, margin.left);
    };

    if (doc.version !== DOC_VERSION_LATEST) {
        throw new Error(`Invariant: doc.version (${doc.version}) must be migrated to ${DOC_VERSION_LATEST} before use.`);
    }

    for (const presetId of doc.pagePresetOrder ?? []) {
        const preset = doc.pagePresetsById?.[presetId];
        if (!preset) {
            throw new Error(`Invariant: pagePresetOrder references missing preset ${presetId}.`);
        }
        assertInt(`pagePresetsById.${presetId}.size.width`, preset.size?.width);
        assertInt(`pagePresetsById.${presetId}.size.height`, preset.size?.height);
        assertMargin(`pagePresetsById.${presetId}.margin`, preset.margin);
    }

    for (const pageId of doc.pageOrder ?? []) {
        const page = doc.pagesById?.[pageId];
        if (!page) {
            throw new Error(`Invariant: pageOrder references missing page ${pageId}.`);
        }
        if (page.marginOverride) assertMargin(`pagesById.${pageId}.marginOverride`, page.marginOverride);
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

    for (const [nodeId, node] of Object.entries(doc.nodesById ?? {})) {
        assertInt(`nodesById.${nodeId}.x`, node.x);
        assertInt(`nodesById.${nodeId}.y`, node.y);
        assertInt(`nodesById.${nodeId}.w`, node.w);
        assertInt(`nodesById.${nodeId}.h`, node.h);

        if (node.type === "text") {
            assertInt(`nodesById.${nodeId}.style.fontSize`, node.style.fontSize);
            assertInt(`nodesById.${nodeId}.style.lineHeight`, node.style.lineHeight);
            const ls = (node.style as { letterSpacing?: number }).letterSpacing;
            if (typeof ls === "number") assertInt(`nodesById.${nodeId}.style.letterSpacing`, ls);
            if (node.autosize?.minH !== undefined) assertInt(`nodesById.${nodeId}.autosize.minH`, node.autosize.minH);
            if (node.autosize?.maxH !== undefined) assertInt(`nodesById.${nodeId}.autosize.maxH`, node.autosize.maxH);
        }

        if (node.type === "box") {
            assertInt(`nodesById.${nodeId}.style.strokeWidth`, node.style.strokeWidth);
            assertInt(`nodesById.${nodeId}.style.radius`, node.style.radius);
        }

        if (node.type === "image" && node.crop) {
            assertInt(`nodesById.${nodeId}.crop.x`, node.crop.x);
            assertInt(`nodesById.${nodeId}.crop.y`, node.crop.y);
            assertInt(`nodesById.${nodeId}.crop.w`, node.crop.w);
            assertInt(`nodesById.${nodeId}.crop.h`, node.crop.h);
        }
    }

    for (const [presetId, hf] of Object.entries(doc.headerFooterByPresetId ?? {})) {
        if (!doc.pagePresetsById?.[presetId]) {
            throw new Error(`Invariant: headerFooterByPresetId references missing preset ${presetId}.`);
        }
        assertInt(`headerFooterByPresetId.${presetId}.header.heightPx`, hf.header?.heightPx);
        assertInt(`headerFooterByPresetId.${presetId}.header.minHeightPx`, hf.header?.minHeightPx);
        assertInt(`headerFooterByPresetId.${presetId}.header.maxHeightPx`, hf.header?.maxHeightPx);
        assertInt(`headerFooterByPresetId.${presetId}.footer.heightPx`, hf.footer?.heightPx);
        assertInt(`headerFooterByPresetId.${presetId}.footer.minHeightPx`, hf.footer?.minHeightPx);
        assertInt(`headerFooterByPresetId.${presetId}.footer.maxHeightPx`, hf.footer?.maxHeightPx);
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

    if (doc.guides?.byId) {
        for (const [guideId, guide] of Object.entries(doc.guides.byId)) {
            assertInt(`guides.byId.${guideId}.pos`, guide.pos);
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

function normalizeNodePatchToPt100(patch: Partial<NodeJson>): Partial<NodeJson> {
    const next: Partial<NodeJson> = { ...patch };
    if (typeof patch.x === "number") next.x = ptToPt100(patch.x);
    if (typeof patch.y === "number") next.y = ptToPt100(patch.y);
    if (typeof patch.w === "number") next.w = ptToPt100(patch.w);
    if (typeof patch.h === "number") next.h = ptToPt100(patch.h);

    if (patch.style) {
        next.style = {
            ...patch.style,
            ...(typeof (patch.style as any).fontSize === "number" ? { fontSize: ptToPt100((patch.style as any).fontSize) } : {}),
            ...(typeof (patch.style as any).lineHeight === "number" ? { lineHeight: ptToPt100((patch.style as any).lineHeight) } : {}),
            ...(typeof (patch.style as any).letterSpacing === "number"
                ? { letterSpacing: ptToPt100((patch.style as any).letterSpacing) }
                : {}),
            ...(typeof (patch.style as any).strokeWidth === "number"
                ? { strokeWidth: ptToPt100((patch.style as any).strokeWidth) }
                : {}),
            ...(typeof (patch.style as any).radius === "number" ? { radius: ptToPt100((patch.style as any).radius) } : {}),
        } as any;
    }

    if (patch.type === "image" && patch.crop) {
        next.crop = {
            ...patch.crop,
            ...(typeof patch.crop.x === "number" ? { x: ptToPt100(patch.crop.x) } : {}),
            ...(typeof patch.crop.y === "number" ? { y: ptToPt100(patch.crop.y) } : {}),
            ...(typeof patch.crop.w === "number" ? { w: ptToPt100(patch.crop.w) } : {}),
            ...(typeof patch.crop.h === "number" ? { h: ptToPt100(patch.crop.h) } : {}),
        };
    }

    if (patch.type === "text" && patch.autosize) {
        next.autosize = {
            ...patch.autosize,
            ...(typeof patch.autosize.minH === "number" ? { minH: ptToPt100(patch.autosize.minH) } : {}),
            ...(typeof patch.autosize.maxH === "number" ? { maxH: ptToPt100(patch.autosize.maxH) } : {}),
        };
    }

    return next;
}

function normalizeNodeToPt100(node: NodeJson): NodeJson {
    const base: NodeJson = {
        ...(node as any),
        x: ptToPt100(node.x),
        y: ptToPt100(node.y),
        w: ptToPt100(node.w),
        h: ptToPt100(node.h),
    };

    if (node.type === "text") {
        return {
            ...base,
            style: {
                ...node.style,
                fontSize: ptToPt100(node.style.fontSize),
                lineHeight: ptToPt100(node.style.lineHeight),
                ...(typeof (node.style as any).letterSpacing === "number"
                    ? { letterSpacing: ptToPt100((node.style as any).letterSpacing) }
                    : {}),
            },
            autosize: node.autosize
                ? {
                    ...node.autosize,
                    ...(typeof node.autosize.minH === "number" ? { minH: ptToPt100(node.autosize.minH) } : {}),
                    ...(typeof node.autosize.maxH === "number" ? { maxH: ptToPt100(node.autosize.maxH) } : {}),
                }
                : node.autosize,
        } as any;
    }

    if (node.type === "box") {
        return {
            ...base,
            style: {
                ...node.style,
                ...(typeof node.style.strokeWidth === "number" ? { strokeWidth: ptToPt100(node.style.strokeWidth) } : {}),
                ...(typeof node.style.radius === "number" ? { radius: ptToPt100(node.style.radius) } : {}),
            },
        } as any;
    }

    if (node.type === "image" && node.crop) {
        return {
            ...base,
            crop: {
                ...node.crop,
                x: ptToPt100(node.crop.x),
                y: ptToPt100(node.crop.y),
                w: ptToPt100(node.crop.w),
                h: ptToPt100(node.crop.h),
            },
        } as any;
    }

    return base;
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

    setPresetHeaderHeightPx: (presetId: Id, heightPx: number) => void;
    setPresetFooterHeightPx: (presetId: Id, heightPx: number) => void;
    setPageHeaderFooterHidden: (pageId: Id, patch: { headerHidden?: boolean; footerHidden?: boolean }) => void;
    updateRepeatAreaHeightPx: (presetId: Id, kind: "header" | "footer", heightPx: number) => void;
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
        const d = bootstrapAllPresetHF(initialDoc);
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

        assertDocInvariant(doc);
        assertSelectionInvariant(doc, session);
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
                    Cmd.updateNode(next, nodeId, normalizeNodePatchToPt100(patch));
                });
            },

            addNode: (pageId, node, target) => {
                docHistory.applyDoc((next) => Cmd.addNodeToTarget(next, pageId, target, normalizeNodeToPt100(node)));
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

            setPresetHeaderHeightPx: hfActions.setPresetHeaderHeightPx,
            setPresetFooterHeightPx: hfActions.setPresetFooterHeightPx,
            setPageHeaderFooterHidden: hfActions.setPageHeaderFooterHidden,
            updateRepeatAreaHeightPx: hfActions.updateRepeatAreaHeightPx,
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
