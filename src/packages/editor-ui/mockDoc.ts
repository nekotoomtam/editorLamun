import type { DocumentJson } from "../editor-core/schema";

export const mockDoc: DocumentJson = {
    id: "doc-1",
    name: "Demo Document",
    version: 1,
    unit: "px",

    pagePresets: [
        {
            id: "preset-a4",
            name: "A4",
            size: { width: 800, height: 1100 },
            margin: { top: 40, right: 40, bottom: 40, left: 40 },
        },
    ],

    pages: [{ id: "page-1", index: 0, presetId: "preset-a4", name: "Page 1" }],

    assets: {
        images: [
            {
                id: "img-1",
                type: "image",
                src: "https://picsum.photos/400/240",
            },
        ],
    },

    nodes: [
        {
            id: "box-1",
            pageId: "page-1",
            type: "box",
            name: "Box",
            x: 80,
            y: 120,
            w: 320,
            h: 160,
            z: 1,
            style: { fill: "#f3f4f6", stroke: "#111827", strokeWidth: 1, radius: 8 },
        },
        {
            id: "text-1",
            pageId: "page-1",
            type: "text",
            name: "Title",
            x: 90,
            y: 90,
            w: 520,
            h: 40,
            z: 2,
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
        {
            id: "img-node-1",
            pageId: "page-1",
            type: "image",
            name: "Image",
            x: 420,
            y: 140,
            w: 280,
            h: 180,
            z: 3,
            assetId: "img-1",
            fit: "cover",
            opacity: 1,
        },
    ],
};
