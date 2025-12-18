export type Id = string;
export type Unit = "px" | "pui";

export type DocumentJson = {
    id: Id;
    name: string;
    version: 1;

    meta?: {
        createdAt?: string;
        updatedAt?: string;
        createdBy?: { id: Id; name?: string };
        updatedBy?: { id: Id; name?: string };
    };

    unit: Unit;

    // ✅ presets
    pagePresetOrder: Id[];
    pagePresetsById: Record<Id, PagePreset>;

    // ✅ pages
    pageOrder: Id[];
    pagesById: Record<Id, PageJson>;

    // ✅ nodes
    nodesById: Record<Id, NodeJson>;
    nodeOrderByPageId: Record<Id, Id[]>;

    // ✅ assets
    assets?: {
        imageOrder: Id[];
        imagesById: Record<Id, AssetImage>;
    };

    // ✅ guides (doc-level)
    guides?: {
        order: Id[];
        byId: Record<Id, GuideJson>;
    };
};

export type PagePreset = {
    id: Id;
    name: string;
    size: { width: number; height: number };
    margin: { top: number; right: number; bottom: number; left: number };
};

export type PageJson = {
    id: Id;
    presetId: Id;
    name?: string;
    locked?: boolean;
    visible?: boolean;

    override?: {
        margin?: Partial<PagePreset["margin"]>;
    };
};

export type NodeBase = {
    id: Id;
    pageId: Id;

    type: "text" | "box" | "image" | "group";
    name?: string;

    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;

    // แนะนำให้เลิกใช้ทีหลัง แต่เก็บไว้ได้ถ้าของเดิมยังต้องใช้
    z?: number;

    visible?: boolean;
    locked?: boolean;

    parentId?: Id | null;

    constraints?: {
        pinLeft?: boolean;
        pinRight?: boolean;
        pinTop?: boolean;
        pinBottom?: boolean;
    };

    // (optional) ถ้าจะทำ “ติดเส้น” แบบแปะ id เส้น
    guideId?: Id | null;
};

export type TextNode = NodeBase & {
    type: "text";
    text: string;
    style: {
        fontFamily: string;
        fontSize: number;
        lineHeight: number;
        color?: string;
        align: "left" | "center" | "right" | "justify";
        verticalAlign?: "top" | "middle" | "bottom";
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
    };
    autosize?: {
        mode: "none" | "height";
        minH?: number;
        maxH?: number;
    };
};

export type BoxNode = NodeBase & {
    type: "box";
    style: {
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        radius?: number;
    };
};

export type ImageFit = "contain" | "cover" | "stretch";

export type ImageNode = NodeBase & {
    type: "image";
    assetId: Id;
    fit: ImageFit;
    opacity?: number;
    crop?: { x: number; y: number; w: number; h: number };
};

export type GroupNode = NodeBase & {
    type: "group";
    children: Id[];
};

export type NodeJson = TextNode | BoxNode | ImageNode | GroupNode;

export type AssetImage = {
    id: Id;
    type: "image";
    src: string;
    mime?: string;
    width?: number;
    height?: number;
    hash?: string;
};

export type GuideJson = {
    id: Id;

    // เส้นแนวตั้ง (x) วิ่งทุกหน้า
    pos: number;

    // batch align ของเส้นนี้
    align?: "left" | "center" | "right";

    // เปิด TOC
    tocEnabled?: boolean;
    tocKey?: string;

    label?: string;

    locked?: boolean;
    visible?: boolean;
};
