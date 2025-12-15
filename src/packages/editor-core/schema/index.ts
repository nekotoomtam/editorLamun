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

    pagePresets: PagePreset[];
    pages: PageJson[];
    nodes: NodeJson[];

    assets?: {
        images: AssetImage[];
    };

    guides?: GuideJson[];
};

export type PagePreset = {
    id: Id;
    name: string;
    size: { width: number; height: number };
    margin: { top: number; right: number; bottom: number; left: number };
};

export type PageJson = {
    id: Id;
    index: number;
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

    z: number;
    visible?: boolean;
    locked?: boolean;

    parentId?: Id | null;

    constraints?: {
        pinLeft?: boolean;
        pinRight?: boolean;
        pinTop?: boolean;
        pinBottom?: boolean;
    };
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
    src: string; // url/base64/file-id
    mime?: string;
    width?: number;
    height?: number;
    hash?: string;
};

export type GuideJson = {
    id: Id;
    pageId: Id;
    axis: "x" | "y";
    pos: number;
    name?: string;
    locked?: boolean;
    visible?: boolean;
    snap?: {
        enabled: boolean;
        strength?: number; // 0..1
    };
};
