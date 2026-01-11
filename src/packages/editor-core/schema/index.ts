export type Id = string;
export type Unit = "px";

export const DOC_VERSION_LATEST = 1 as const;
export type DocVersion = number;

export type Margin = PagePreset["margin"];
export type MarginSource = "preset" | "page";

export type RepeatArea = {
    id: Id;
    name?: string;
    heightPx: number;        // ใช้จริง
    minHeightPx?: number;    // clamp
    maxHeightPx?: number;    // clamp
    /**
     * Phase-1 decision:
     * - Nodes are stored globally in DocumentJson.nodesById
     * - Repeat areas only keep ordering (IDs)
     *
     * Backward-compat: older docs might still contain nodesById inside header/footer.
     * We keep it optional for migration and will ignore it in selectors/render.
     */
    nodesById?: Record<Id, NodeJson>;
    nodeOrder: Id[];
};


export type DocumentJson = {
    id: Id;
    name: string;
    version: DocVersion;

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
    headerFooterByPresetId?: Record<Id, {
        header: RepeatArea;
        footer: RepeatArea;
    }>;
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
    /**
     * @deprecated (Phase-1): legacy experiment. Header/Footer are per-preset via headerFooterByPresetId.
     * Keep only slotIds for backward compatibility; do not add new fields here.
     */
    layout?: {
        headerSlotId?: Id | null;
        footerSlotId?: Id | null;
    };
};

export type PagePreset = {
    id: Id;
    name: string;
    size: { width: number; height: number };
    margin: { top: number; right: number; bottom: number; left: number };
    source?: "system" | "custom"
    locked?: boolean;              // ล็อกโครงกระดาษ
    usageHint?: string;            // ข้อความบอกเจตนา
};

export type PageJson = {
    id: Id;
    presetId: Id;
    name?: string;
    locked?: boolean;
    visible?: boolean;

    // NEW: margin source
    marginSource?: "preset" | "page"; // default = "preset"
    pageMargin?: PagePreset["margin"]; // ใช้เมื่อ marginSource = "page"

    // OLD (optional): เก็บไว้ชั่วคราวเพื่อ backward compat
    marginOverride?: Partial<PagePreset["margin"]> | null;

    headerHidden?: boolean;
    footerHidden?: boolean;
};

export type NodeOwner =
    | { kind: "page"; pageId: Id }
    | { kind: "header"; presetId: Id }
    | { kind: "footer"; presetId: Id };

export type NodeBase = {
    id: Id;
    owner: NodeOwner;
    /**
     * @deprecated: pageId is redundant once owner.kind === 'page'.
     * Keep optional for backward compatibility.
     */
    pageId?: Id;

    type: "text" | "box" | "image" | "group" | "field";
    name?: string;

    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;

    // แนะนำให้เลิกใช้ทีหลัง แต่เก็บไว้ได้ถ้าของเดิมยังต้องใช้
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

export type NodeJson =
    | TextNode
    | BoxNode
    | ImageNode
    | GroupNode
    | FieldNode;

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

export type FieldType =
    | "text"
    | "number"
    | "date"
    | "select"
    | "checkbox";

export type FieldNode = NodeBase & {
    type: "field";

    // key สำหรับ map JSON
    key: string;

    // label สำหรับ form / user
    label: string;

    // คำอธิบายว่ากรอกอะไร
    hint?: string;

    fieldType: FieldType;

    required?: boolean;

    visibility?: "both" | "canvas" | "form" | "hidden";

    options?: {
        label: string;
        value: string | number;
    }[];

    // เตรียมไว้สำหรับอนาคต (ยังไม่ต้องใช้)
    valueExpr?: string;
};

export function normalizePresetOrientation(
    preset: PagePreset,
    mode: "portrait" | "landscape"
): PagePreset {
    const { width, height } = preset.size;

    if (mode === "portrait" && width > height) {
        return {
            ...preset,
            size: { width: height, height: width },
        };
    }

    if (mode === "landscape" && height > width) {
        return {
            ...preset,
            size: { width: height, height: width },
        };
    }

    return preset;
}

export const getOrientation = (p: PagePreset) =>
    p.size.width > p.size.height ? "landscape" : "portrait";
