// packages/editor-renderer/pdf/exportProofPdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { DocumentLayout, PageLayout, LayoutNode } from "../layout/types";
import type { BoxNode } from "../../editor-core/schema";

type ExportOptions = {
    // เผื่อปิด debug ทีหลัง
    debug?: boolean;
};

function toPt(v: number): number {
    return v / 100;
}

function rectToPt(rect: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
    return {
        x: toPt(rect.x),
        y: toPt(rect.y),
        w: toPt(rect.w),
        h: toPt(rect.h),
    };
}

function parseHexColor(input?: string) {
    if (!input) return null;
    const v = input.trim().toLowerCase();
    if (v === "transparent") return null;
    if (!v.startsWith("#")) return null;

    const hex = v.slice(1);
    if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return rgb(r / 255, g / 255, b / 255);
    }

    if (hex.length === 6 || hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return rgb(r / 255, g / 255, b / 255);
    }

    return null;
}

export async function exportProofPdf(
    docLayout: DocumentLayout,
    opts: ExportOptions = { debug: true }
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const p of docLayout.pages) {
        // pdf-lib ใช้ origin มุมล่างซ้าย (bottom-left)
        // แต่ editor ส่วนใหญ่เป็น top-left => ต้องแปลงแกน Y ทุกครั้ง
        const pageW = toPt(p.pageWidth);
        const pageH = toPt(p.pageHeight);
        const page = pdf.addPage([pageW, pageH]);

        if (opts.debug) {
            drawPageDebug(page, font, p, pageH);
        }

        // วาด node แบบกล่อง + label (Proof)
        for (const n of p.nodes) {
            drawNodeBox(page, font, n, pageH);
        }
    }

    return await pdf.save();
}

/** แปลง y (top-left space) -> pdf-lib y (bottom-left space) */
function toPdfY(pageH: number, yTop: number, h: number): number {
    // yTop คือ y จากบนลงล่าง
    // pdf y คือจากล่างขึ้นบน
    return pageH - yTop - h;
}

function drawRect(
    page: any,
    pageH: number,
    rect: { x: number; y: number; w: number; h: number },
    lineWidth = 1
) {
    page.drawRectangle({
        x: rect.x,
        y: toPdfY(pageH, rect.y, rect.h),
        width: rect.w,
        height: rect.h,

        // ✅ ทำให้เป็นกรอบ ไม่ถมดำ
        borderWidth: lineWidth,
        borderColor: rgb(0, 0, 0),
        color: rgb(0, 0, 0), // มีได้ แต่…
        opacity: 0,          // ✅ fill โปร่งใส
        borderOpacity: 1,
    });
}


function drawText(
    page: any,
    font: any,
    pageH: number,
    x: number,
    yTop: number,
    text: string,
    size = 9
) {
    page.drawText(text, {
        x,
        y: pageH - yTop - size, // baseline approx
        size,
        font,
    });
}

function drawPageDebug(page: any, font: any, p: PageLayout, pageH: number) {
    const pageW = toPt(p.pageWidth);
    const pageRectPt = rectToPt({ x: 0, y: 0, w: p.pageWidth, h: p.pageHeight });
    const bodyRectPt = rectToPt(p.bodyRect);
    const headerHPt = toPt(p.headerH);
    const footerHPt = toPt(p.footerH);

    // 1) ขอบกระดาษ
    drawRect(page, pageH, pageRectPt, 1);

    // 2) header/footer zones (แค่กรอบ)
    if (p.headerH > 0) {
        const headerRectPt = {
            x: bodyRectPt.x,
            y: bodyRectPt.y - headerHPt,
            w: bodyRectPt.w,
            h: headerHPt,
        };
        drawRect(page, pageH, headerRectPt, 1);
        drawText(page, font, pageH, headerRectPt.x + 6, headerRectPt.y + 6, `HEADER h=${headerHPt}`);
    }

    if (p.footerH > 0) {
        const footerRectPt = {
            x: bodyRectPt.x,
            y: bodyRectPt.y + bodyRectPt.h,
            w: bodyRectPt.w,
            h: footerHPt,
        };
        drawRect(page, pageH, footerRectPt, 1);
        drawText(page, font, pageH, footerRectPt.x + 6, footerRectPt.y + 6, `FOOTER h=${footerHPt}`);
    }


    // 3) bodyRect (สำคัญที่สุด)
    drawRect(page, pageH, bodyRectPt, 2);
    drawText(page, font, pageH, bodyRectPt.x + 4, bodyRectPt.y + 4, "BODY_RECT", 10);

    // 4) label หน้า
    drawText(page, font, pageH, 6, 18, `pageId=${String(p.page.id)}`);
    drawText(page, font, pageH, 6, 30, `w=${pageW} h=${pageH}`);
}

function drawNodeBox(page: any, font: any, n: LayoutNode, pageH: number) {
    const nodeRectPt = rectToPt({ x: n.x, y: n.y, w: n.w, h: n.h });

    // กล่อง node
    if (n.type === "box" && (n.node as BoxNode | undefined)?.type === "box") {
        const box = n.node as BoxNode;
        const fillColor = parseHexColor(box.style?.fill);
        const strokeColor = parseHexColor(box.style?.stroke) ?? rgb(0, 0, 0);

        page.drawRectangle({
            x: nodeRectPt.x,
            y: toPdfY(pageH, nodeRectPt.y, nodeRectPt.h),
            width: nodeRectPt.w,
            height: nodeRectPt.h,
            borderWidth: toPt(box.style?.strokeWidth ?? 100),
            borderColor: strokeColor,
            color: fillColor ?? rgb(0, 0, 0),
            opacity: fillColor ? 1 : 0,
            borderOpacity: 1,
        });
    } else {
        drawRect(page, pageH, nodeRectPt, 1);
    }

    // label เล็ก ๆ
    const label = `${n.target}:${n.type}:${String(n.id).slice(0, 8)}`;
    drawText(page, font, pageH, nodeRectPt.x + 2, nodeRectPt.y + 2, label, 7);
}
