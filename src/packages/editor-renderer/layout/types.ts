import type { DocumentJson, Id, PageJson } from "../../editor-core/schema";

export type LayoutNode = {
    id: Id;
    type: string;
    // absolute box in page coordinates (doc units)
    x: number;
    y: number;
    w: number;
    h: number;
    // original node json for adapters
    node: unknown;
};

export type PageLayout = {
    page: PageJson;
    pageWidth: number;
    pageHeight: number;
    nodes: LayoutNode[];
};

export type DocumentLayout = {
    document: DocumentJson;
    pages: PageLayout[];
};
