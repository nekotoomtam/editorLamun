// Backward-compatible barrel. Keep existing import paths working while we split by concern.

export { setActivePage } from "./session";

export { addNode, addNodeToTarget, updateNode } from "./nodes";

export { ensureHeaderFooter, ensureHFCloneForPreset } from "./headerFooter";

export { addPagePreset, setPresetMargin } from "./presets";

export { ensureFirstPage, setPageMarginOverride } from "./pages";

export { clampMargin, DEFAULT_MARGIN } from "./margins";
