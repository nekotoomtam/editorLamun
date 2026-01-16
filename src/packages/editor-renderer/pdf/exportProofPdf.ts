// packages/editor-renderer/pdf/exportProofPdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { DocumentLayout, PageLayout, LayoutNode } from "../layout/types";

type ExportOptions = {
    // เผื่อปิด debug ทีหลัง
    debug?: boolean;
};

export async function exportProofPdf(
    docLayout: DocumentLayout,
    opts: ExportOptions = { debug: true }
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const p of docLayout.pages) {
        // pdf-lib ใช้ origin มุมล่างซ้าย (bottom-left)
        // แต่ editor ส่วนใหญ่เป็น top-left => ต้องแปลงแกน Y ทุกครั้ง
        const page = pdf.addPage([p.pageWidth, p.pageHeight]);

        if (opts.debug) {
            drawPageDebug(page, font, p);
        }

        // วาด node แบบกล่อง + label (Proof)
        for (const n of p.nodes) {
            drawNodeBox(page, font, p, n);
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

function drawPageDebug(page: any, font: any, p: PageLayout) {
    const pageH = p.pageHeight;

    // 1) ขอบกระดาษ
    drawRect(page, pageH, { x: 0, y: 0, w: p.pageWidth, h: p.pageHeight }, 1);

    // 2) header/footer zones (แค่กรอบ)
    if (p.headerH > 0) {
        drawRect(page, pageH, { x: 0, y: 0, w: p.pageWidth, h: p.headerH }, 1);
        drawText(page, font, pageH, 6, 6, `HEADER h=${p.headerH}`);
    }
    if (p.footerH > 0) {
        drawRect(page, pageH, {
            x: 0,
            y: p.pageHeight - p.footerH,
            w: p.pageWidth,
            h: p.footerH,
        });
        drawText(page, font, pageH, 6, p.pageHeight - p.footerH + 6, `FOOTER h=${p.footerH}`);
    }

    // 3) bodyRect (สำคัญที่สุด)
    drawRect(page, pageH, p.bodyRect, 2);
    drawText(page, font, pageH, p.bodyRect.x + 4, p.bodyRect.y + 4, "BODY_RECT", 10);

    // 4) label หน้า
    drawText(page, font, pageH, 6, 18, `pageId=${String(p.page.id)}`);
    drawText(page, font, pageH, 6, 30, `w=${p.pageWidth} h=${p.pageHeight}`);
}

function drawNodeBox(page: any, font: any, p: PageLayout, n: LayoutNode) {
    const pageH = p.pageHeight;

    // กล่อง node
    drawRect(page, pageH, { x: n.x, y: n.y, w: n.w, h: n.h }, 1);

    // label เล็ก ๆ
    const label = `${n.target}:${n.type}:${String(n.id).slice(0, 8)}`;
    drawText(page, font, pageH, n.x + 2, n.y + 2, label, 7);
}
