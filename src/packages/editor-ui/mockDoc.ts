import type { DocumentJson } from "../editor-core/schema";

export const mockDoc: DocumentJson = {
    id: "doc-1",
    name: "Demo Document",
    version: 1,
    unit: "pt",

    // ===== Presets =====
    pagePresetOrder: ["preset-a4", "preset-custom-1"],
    pagePresetsById: {
        "preset-a4": {
            id: "preset-a4",
            name: "A4 (Official)",
            size: { width: 59500, height: 84200 },
            margin: { top: 3000, right: 3000, bottom: 3000, left: 3000 },
            source: "system",
            locked: true,
            usageHint: "ใช้สำหรับเอกสารทางการ / ส่งราชการ",
        },
        "preset-custom-1": {
            id: "preset-custom-1",
            name: "Custom (Landscape)",
            size: { width: 75000, height: 52500 },
            margin: { top: 2400, right: 2400, bottom: 2400, left: 2400 },
            source: "custom",

        },
    },

    // ===== Pages =====
    pageOrder: ["page-1", "page-2"],
    pagesById: {
        "page-1": {
            id: "page-1",
            presetId: "preset-a4",
            name: "Page 1",
            visible: true,
            locked: false,
        },
        "page-2": {
            id: "page-2",
            presetId: "preset-custom-1",
            name: "Page 2",
            visible: true,
            locked: false,
        },
    },

    // ===== Assets =====
    assets: {
        imageOrder: ["img-1"],
        imagesById: {
            "img-1": {
                id: "img-1",
                type: "image",
                src: "https://picsum.photos/400/240",
            },
        },
    },

    // ===== Nodes =====
    nodesById: {
        "box-1": {
            id: "box-1",
            owner: { kind: "page", pageId: "page-1" },
            pageId: "page-1",
            type: "box",
            name: "Box",
            x: 6000,
            y: 9000,
            w: 24000,
            h: 12000,

            visible: true,
            locked: false,
            style: {
                fill: "#f3f4f6",
                stroke: "#111827",
                strokeWidth: 100,
                radius: 800,
            },
        },

        "text-1": {
            id: "text-1",
            owner: { kind: "page", pageId: "page-1" },
            pageId: "page-1",
            type: "text",
            name: "Title",
            x: 6750,
            y: 6750,
            w: 39000,
            h: 3000,

            visible: true,
            locked: false,
            text: "Hello Editor 👋",
            style: {
                fontFamily: "system-ui",
                fontSize: 2100,
                lineHeight: 2400,
                align: "left",
                color: "#111827",
                bold: true,
            },
            autosize: { mode: "height" },
        },

        "img-node-1": {
            id: "img-node-1",
            owner: { kind: "page", pageId: "page-1" },
            pageId: "page-1",
            type: "image",
            name: "Image",
            x: 31500,
            y: 10500,
            w: 21000,
            h: 13500,

            visible: true,
            locked: false,
            assetId: "img-1",
            fit: "cover",
            opacity: 1,
        },
    },

    nodeOrderByPageId: {
        "page-1": ["box-1", "text-1", "img-node-1"],
        "page-2": [], // ✅ กัน undefined
    },

    // ===== Guides =====
    guides: {
        order: [],
        byId: {},
    },
};
