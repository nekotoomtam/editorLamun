import type { DocumentJson } from "../editor-core/schema";

export const mockDoc: DocumentJson = {
    id: "doc-1",
    name: "Demo Document",
    version: 1,
    unit: "px",

    // ===== Presets =====
    pagePresetOrder: ["preset-a4", "preset-custom-1"],
    pagePresetsById: {
        "preset-a4": {
            id: "preset-a4",
            name: "A4 (Official)",
            size: { width: 800, height: 1100 },
            margin: { top: 40, right: 40, bottom: 40, left: 40 },
            source: "system",
            locked: true,
            usageHint: "ใช้สำหรับเอกสารทางการ / ส่งราชการ",
        },
        "preset-custom-1": {
            id: "preset-custom-1",
            name: "Custom (Landscape)",
            size: { width: 1000, height: 700 },
            margin: { top: 32, right: 32, bottom: 32, left: 32 },
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
            pageId: "page-1",
            type: "box",
            name: "Box",
            x: 80,
            y: 120,
            w: 320,
            h: 160,

            visible: true,
            locked: false,
            style: {
                fill: "#f3f4f6",
                stroke: "#111827",
                strokeWidth: 1,
                radius: 8,
            },
        },

        "text-1": {
            id: "text-1",
            pageId: "page-1",
            type: "text",
            name: "Title",
            x: 90,
            y: 90,
            w: 520,
            h: 40,

            visible: true,
            locked: false,
            text: "Hello Editor 👋",
            style: {
                fontFamily: "system-ui",
                fontSize: 28,
                lineHeight: 32,
                align: "left",
                color: "#111827",
                bold: true,
            },
            autosize: { mode: "height" },
        },

        "img-node-1": {
            id: "img-node-1",
            pageId: "page-1",
            type: "image",
            name: "Image",
            x: 420,
            y: 140,
            w: 280,
            h: 180,

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
