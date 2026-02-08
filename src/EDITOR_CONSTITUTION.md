# Editor Constitution

> เอกสารนี้คือ **กฎสูงสุดของ editor**
> ทุกการออกแบบ / refactor / เพิ่ม feature ต้อง *ไม่ละเมิด* กฎเหล่านี้
> ถ้าจำเป็นต้องฝ่าฝืน ต้องมีเหตุผลชัด + ตัดสินใจร่วมกัน

---

## A) Source of Truth

### A1. DocumentJson คือ Source of Truth เดียว

* DocumentJson = ความจริงของเอกสาร (structure + content)
* UI ห้ามถือสำเนา doc
* อนุญาตเฉพาะ read-only snapshot ที่สร้างใหม่จาก doc (เช่น export / preview)

### A2. UI อ่าน doc ผ่าน selectors เท่านั้น

* UI ห้ามเข้าถึงโครงสร้าง doc ดิบกระจัดกระจาย
* cache ได้เฉพาะ **derived state** ที่พิสูจน์แล้วว่าไม่เปลี่ยนความหมาย
* ทุก cache ต้องมี invalidation rule ชัดเจน

### A3. Derived state = f(doc, uiState)

* derived state ต้องคำนวณจาก (doc, uiState) เท่านั้น
* ห้าม derived กลายเป็น state ที่แก้เองจนหลุดจาก doc

---

## B) Mutation & Determinism

### B1. แก้ doc ผ่านช่องทางเดียว

* แก้ doc ได้ผ่าน `dispatch(action)` หรือ `apply(op)` เท่านั้น
* ห้าม mutate doc กระจัดกระจายหลายไฟล์
* ช่องทางนี้ต้อง enforce ได้ (store / reducer / op pipeline เดียว)

### B2. ทุกการแก้ต้อง deterministic

* action/op เดียว + input เดียว → ผลลัพธ์ต้องเหมือนเดิมเสมอ
* ห้ามผูกผลกับ DOM / เวลา / random
* ถ้าจำเป็นต้องใช้ environment ให้ inject ผ่าน dependency
* id generation is considered part of determinism and must not rely on randomness or time

### B3. Command / Op ต้อง atomic + reversible

* atomic: ทำครั้งเดียวจบ
* reversible: undo ได้
* drag / resize:

  * ระหว่างลาก = ui preview (uiState)
  * ตอนปล่อย = commit op เดียว
* op ควรเป็น pure และ serializable

---

## C) Ordering, Coordinates, UI Separation

### C1. Node order คือ z-index

* `nodeOrderByPageId[pageId]` = ลำดับทับซ้อน
* bringToFront / sendToBack = แก้ order เท่านั้น
* ห้ามมี z-index แอบใน node
* order ต้อง stable (ห้าม sort ใหม่เองตาม type/ชื่อ)

### C2. UI state แยกจาก doc state 100%

* UI state เช่น:

  * zoom, mode, activePageId, viewingPageId
  * selection, hover, activeZone (header/body/footer)
  * dragPreview, transient flags
* UI state reset ได้โดยไม่กระทบเอกสาร

### C3. Coordinate & Unit Consistency

* Document geometry (position, size, margin, spacing) must be stored in **pt100 (integer)** only
* pt100 = 1/100 pt (1 pt = 1/72 inch)
* px is **for UI / viewport rendering only** and must never be serialized into the document
* zoom / scale is applied at the UI boundary only
* snap / grid / guides must operate in pt100 (or units converted to pt100 before use)


* UI may use floating-point values during interaction (typing, dragging, preview)
* Only committed document state may enter the core, and it must be converted to pt100
* UI display precision must not exceed commit precision


---

## D) DOM Independence & Virtualization

### D1. Business logic ต้องไม่ผูกกับ DOM

* layout / metrics สำคัญต้องคำนวณจาก model ได้
* ต้องคิดได้แม้หน้ายังไม่ mount
* DOM ใช้เฉพาะ:

  * interaction (pointer / keyboard)
  * measurement ที่เลี่ยงไม่ได้
* measurement ต้องผ่าน abstraction กลาง (swap / mock ได้)
* DOM measurements must never be stored directly as document geometry


### D2. Virtualization เป็น optimization ไม่ใช่ logic

* ระบบต้องคิดถูกแม้หน้าไม่ render
* scrollTo / selection ใช้ model + metrics
* ห้ามพึ่ง element ที่ mount อยู่

### D3. Scroll / Active ต้อง deterministic

* ต้องมี rule ชัด:

  * threshold คืออะไร
  * tie-break ทำยังไง
* แยก manual scroll vs programmatic scroll
* มี cooldown / lock ชั่วคราว
* ห้ามกระพริบเพราะ observer หลายหน้าชนกัน

---

## E) Architecture Hygiene

### E1. I/O แยกเลเยอร์

* import / export / render (pdf / image) อยู่นอก editor-core
* editor-core ไม่รู้จัก API / ไฟล์ / DB
* core ส่งออกเฉพาะ model + intent

### E2. Versioning + Migration ตั้งแต่วันแรก

* มี `doc.version`
* มี `migrate(doc)`
* กฎ: read → migrate → ใช้ latest version เท่านั้น

### E3. Invariants + Sanitize

* มี `assertDocInvariant(doc)` หรือ `sanitizeDoc(doc)` (dev mode)
* ตัวอย่าง invariant:

  * pageId ใน order ต้องมีจริงใน pagesById
  * nodeOrder ต้องชี้ node ที่มีจริง
  * ลบ page ต้อง cleanup nodes / order / selection ให้ครบ

* All document geometry values must be integers (pt100)
* No document field may imply another unit (e.g. Px, Mm, Cm)
---

## F) Additional Laws (เสริม)

### F1. Stable IDs

* pageId / nodeId ห้าม reuse
* id generation ต้อง deterministic และ unique

### F2. No Cross-layer Imports

* UI ห้าม import core ลึกกระจัดกระจาย
* core export ผ่าน index / barrel เดียว
* ลด coupling ตอน refactor

---

### G) Boundary Rules

* All unit conversions must happen at layer boundaries
* editor-core never converts units
* UI is responsible for converting user input to pt100 before dispatch
---

## Final Rule

> ถ้ากฎข้อใดถูกละเมิด:
>
> * ต้องรู้ตัวว่าละเมิด
> * ต้องอธิบายได้ว่าทำไม
> * และต้องรู้ผลกระทบระยะยาว

Editor นี้ถูกออกแบบให้ **โตได้โดยไม่พัง**
ไม่ใช่แค่ให้ใช้งานได้วันนี้

Note:
Detailed specifications (e.g. text layout, wrapping, rendering)
are defined outside this document and may evolve independently,
as long as they do not violate the laws above.
