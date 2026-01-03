Editor Constitution (10 ข้อ)

1) DocumentJson คือ Source of Truth เดียว

DocumentJson = ความจริงของเอกสาร (structure + content)

ห้ามมี doc สำเนาใน UI/React state (ยกเว้น read-only snapshot สำหรับ export/preview ที่สร้างใหม่จาก doc)

2) UI ห้ามถือ “สำเนา doc”

UI อ่าน doc ผ่าน selector เท่านั้น

ถ้าต้อง cache: cache ได้เฉพาะ “derived” ที่พิสูจน์แล้วว่าไม่เปลี่ยนความหมาย (เช่น metrics cache) และต้อง invalidation ชัด

3) Derive ทุกอย่างจาก doc + uiState

derived state = f(doc, uiState) เท่านั้น

ห้าม derived กลายเป็น state ที่แก้เองจนหลุดจาก doc

4) แก้ doc ต้องผ่านช่องทางเดียว

แก้ได้ผ่าน dispatch(action) หรือ apply(op) เท่านั้น

ห้ามแก้ doc แบบ mutating กระจายหลายไฟล์

เสริม: “ช่องทางเดียว” ต้อง enforce ได้ (เช่น store เดียว / reducer เดียว)

5) ทุกการแก้ต้อง deterministic

action/op เดียวกัน + input เดียวกัน → ผลลัพธ์ต้องเหมือนเดิมเสมอ

ห้ามผูกผลกับ DOM/เวลา/สุ่ม (ถ้าจำเป็นต้องมี ให้ inject ผ่าน env)

6) Node order คือ z-index (ห้ามมี z แอบ)

nodeOrderByPageId[pageId] = ลำดับทับซ้อน

bringToFront/sendToBack = แก้ order เท่านั้น

เสริม: order ต้องเป็น “stable” (ไม่ sort ใหม่เองตาม type/ชื่อ)

7) UI state แยกจาก doc state 100%

UI state: zoom, mode, activePageId, viewingPageId, selection, hover, activeZone(header/body/footer), dragPreview, flags

doc state: pages/presets/nodes/bindings/slots/hidden flags ที่เป็นข้อมูลเอกสารจริง

Rule: UI state reset ได้โดยไม่กระทบเอกสาร

8) Coordinate อยู่ unit เดียว (ตอนนี้ = px)

doc เก็บทุก geometry เป็น px เดียว

render ห้ามแปลงหน่วยมั่วหลายจุด (ถ้ามี scale/zoom ให้ทำที่ขอบ UI เท่านั้น)

เสริม: snap/grid/guides ต้องคิดใน unit เดียวกันเสมอ

9) Business logic ต้องไม่ผูกกับ DOM

layout/metrics สำคัญต้องคำนวณจาก model ได้ แม้หน้ายังไม่ mount

DOM ใช้แค่ interaction (pointer events) และ measurement ที่เลี่ยงไม่ได้ (เช่น text measure) แล้วต้องผ่าน abstraction กลาง

เสริม: “measurement service” ต้องเป็น dependency ที่ swap ได้ (mock ได้)

10) Virtualization เป็น optimization ไม่ใช่ logic

ระบบต้อง “คิดได้” แม้หน้าไม่ render

scrollTo/selection ใช้ metrics/model ไม่ใช่ใช้ “ของที่ mount อยู่”

11) Scroll/Active page ต้อง deterministic

มี rule ชัด:

threshold คืออะไร

tie-break ทำยังไง

แยก manual scroll vs programmatic scroll (cooldown/lock ชั่วคราว)

ห้ามกระพริบเพราะ observer หลายหน้าแย่งกัน

12) Command/Op ต้อง atomic + reversible

ทุก action/op:

atomic: ทำครั้งเดียวจบ

reversible: undo ได้

drag/resize:

ระหว่างลาก = preview (uiState)

ตอนปล่อย = commit op เดียว

เสริม: op ต้อง “pure” (ไม่มี I/O) และ serializable ได้จะดีมาก

13) I/O แยกเลเยอร์

import/export/render (pdf/image) อยู่ข้างนอก editor-core

editor-core ไม่รู้จัก API/ไฟล์/DB

core ส่งออก “model + intent” ให้ชั้นนอกไปทำงาน

14) Versioning + migration ตั้งแต่วันแรก

doc.version + migrate(doc) ต้องมี แม้ตอนนี้ยัง v1

“อ่านแยก → migrate → ใช้ latest เดียว” เป็นกฎ

15) Invariants + sanitize

มี assertDocInvariant(doc) หรือ sanitizeDoc(doc) สำหรับ dev mode

ตัวอย่าง invariant:

pageId ใน order ต้องมีจริงใน pagesById

nodeOrder ต้องชี้ node ที่มีจริง

ลบ page ต้อง cleanup nodes/order/selection ให้หมด