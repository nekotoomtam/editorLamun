export type Id = string;
export type Unit = "pt";
export type Pt100 = number;
export const PT100_SCALE = 100;
export function ptToPt100(pt: number): Pt100 { return Math.round(pt * PT100_SCALE); }
export function pt100ToPt(v: Pt100): number { return v / PT100_SCALE; }

/**
 * Create a reasonably unique id.
 * - Prefer crypto.randomUUID when available.
 * - Fallback to a time + random based id for older runtimes.
 */
export function createId(prefix?: string): Id {
    const cryptoObj = (globalThis as any)?.crypto as Crypto | undefined;

    // IMPORTANT: bind เพื่อไม่ให้เกิด Illegal invocation
    const randUUID = cryptoObj?.randomUUID
        ? cryptoObj.randomUUID.bind(cryptoObj)
        : undefined;

    const base = randUUID
        ? randUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    return prefix ? `${prefix}-${base}` : base;
}


export const DOC_VERSION_LATEST = 1 as const;
export type DocVersion = number;

export type Margin = {
    top: Pt100;
    right: Pt100;
    bottom: Pt100;
    left: Pt100;
};
export type MarginPatch = Partial<Margin>;
export type MarginSource = "preset" | "page";

export type RepeatArea = {
    id: Id;
    name?: string;
    heightPt: Pt100;        // ใช้จริง
    /**
     * ถ้า true: วาง repeat area อิงภายใต้ margin (content area)
     * - header: เริ่มที่ marginTop
     * - footer: จบที่ pageH - marginBottom
     * ถ้า false: วางอิงขอบกระดาษ (y=0 / y=pageH-h)
     *
     * NOTE: กฎ constraint (min body) ยังใช้ content area เหมือนเดิม
     */
    anchorToMargins?: boolean;
    minHeightPt?: Pt100;    // clamp
    maxHeightPt?: Pt100;    // clamp
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
    size: { width: Pt100; height: Pt100 };
    margin: Margin;
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

    // OLD (optional): เก็บไว้ชั่วคราวเพื่อ backward compat
    marginOverride?: Margin;

    headerHidden?: boolean;
    footerHidden?: boolean;
};
/**
 * Nodes belong to a zone that defines their local coordinate space.
 * - owner.kind === "page": the body/content zone of that page
 * - owner.kind === "header": the preset header zone
 * - owner.kind === "footer": the preset footer zone
 */
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

    /**
     * Node geometry in Pt100, local to the owner zone.
     * - x/y are measured from that zone's origin (body/header/footer), not page origin.
     * - w/h are the node size in the same local Pt100 space.
     */
    x: Pt100;
    y: Pt100;
    w: Pt100;
    h: Pt100;
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
        fontSize: Pt100;
        lineHeight: Pt100;
        color?: string;
        align: "left" | "center" | "right" | "justify";
        verticalAlign?: "top" | "middle" | "bottom";
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
    };
    autosize?: {
        mode: "none" | "height";
        minH?: Pt100;
        maxH?: Pt100;
    };
};

export type BoxNode = NodeBase & {
    type: "box";
    style: {
        fill?: string;
        stroke?: string;
        strokeWidth?: Pt100;
        radius?: Pt100;
    };
};

export type ImageFit = "contain" | "cover" | "stretch";

export type ImageNode = NodeBase & {
    type: "image";
    assetId: Id;
    fit: ImageFit;
    opacity?: number;
    crop?: { x: Pt100; y: Pt100; w: Pt100; h: Pt100 };
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
