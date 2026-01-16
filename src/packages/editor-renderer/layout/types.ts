import type { DocumentJson, Id, PageJson } from "../../editor-core/schema";

export type LayoutNode = {
    id: Id;
    type: string;

    // node อยู่โซนไหน
    target: "page" | "header" | "footer";

    // absolute box in page coordinates
    x: number;
    y: number;
    w: number;
    h: number;

    node: unknown;
};

export type PageLayout = {
    page: PageJson;
    pageWidth: number;
    pageHeight: number;

    // body rect หลัง header/footer + margin
    bodyRect: { x: number; y: number; w: number; h: number };
    headerH: number;
    footerH: number;

    nodes: LayoutNode[];
};

export type DocumentLayout = {
    document: DocumentJson;
    pages: PageLayout[];
};
