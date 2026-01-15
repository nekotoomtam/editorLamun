export type PageRenderLevel = "full" | "skeleton" | "none";

export function getRenderLevel(dist: number, fullRadius = 2, skeletonRadius = 8): PageRenderLevel {
    if (dist <= fullRadius) return "full";
    if (dist <= skeletonRadius) return "skeleton";
    return "none";
}
