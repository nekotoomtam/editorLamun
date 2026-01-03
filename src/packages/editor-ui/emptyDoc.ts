import type { DocumentJson } from "../editor-core/schema";

export const emptyDoc: DocumentJson = {
    id: "doc-empty",
    name: "New Document",
    version: 1,
    unit: "px",

    pagePresetOrder: [],
    pagePresetsById: {},

    pageOrder: [],
    pagesById: {},

    nodesById: {},
    nodeOrderByPageId: {},

    assets: {
        imageOrder: [],
        imagesById: {},
    },

    guides: {
        order: [],
        byId: {},
    },
};
