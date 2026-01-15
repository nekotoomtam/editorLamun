import type { Id } from "../schema";

export function setActivePage(session: { activePageId: Id | null }, pageId: Id | null) {
    session.activePageId = pageId;
}
