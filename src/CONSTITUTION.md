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

### B3. Command / Op ต้อง atomic + reversible

* atomic: ทำครั้งเดียวจบ
* reversible: undo ได้
* drag / resize:

  * ระหว่างลาก = ui preview (uiState)
  * ตอนปล่อย = commit op เดียว
* op ควรเป็น pure และ serializable

### B3. Command / Op ต้อง atomic + reversible

* atomic: ทำครั้งเดียวจบ
* reversible: undo ได้
* drag / resize:
  * ระหว่างลาก = ui preview (uiState)
  * ตอนปล่อย = commit op เดียว
* งานคำนวณระหว่าง preview ต้องเป็น **single-flight**
  * รับผลเฉพาะงานล่าสุด
  * ห้ามสะสม queue / promise chain


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

### C3. Coordinate อยู่ unit เดียว

* Document ใช้ **unit เอกสาร (mm)** เป็นหน่วยจริง
* mm คือ source of truth ของตำแหน่ง/ขนาดทั้งหมดใน doc
* UI แปลง mm → px ผ่าน viewScale เท่านั้น
* PDF แปลง mm → pt ผ่าน conversion เดียวกัน
* ห้ามมี logic ที่คิดตำแหน่งจาก px/pt โดยตรงใน core

---

## D) DOM Independence & Virtualization

### D1. Business logic ต้องไม่ผูกกับ DOM

* layout / metrics สำคัญต้องคำนวณจาก model ได้
* ต้องคิดได้แม้หน้ายังไม่ mount
* DOM ใช้เฉพาะ:
  * interaction (pointer / keyboard)
  * measurement ที่เลี่ยงไม่ได้
* measurement ทุกชนิดต้องผ่าน abstraction กลาง
  * ห้ามเรียก DOM / canvas โดยตรงจาก core


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

## G) Text Layout & Rendering Truth

### G1. LayoutResult คือ Source of Truth ของการวางข้อความ

* การ wrap / line-break / reflow ต้องให้ผลเป็น LayoutResult
* editor / pdf / export ต้อง render จาก LayoutResult เดียวกัน
* ห้ามให้แต่ละ renderer คิด layout เอง

### G2. ห้ามใช้ DOM/CSS เป็นตัวตัดบรรทัด

* CSS line-wrap ใช้ได้เฉพาะเพื่อแสดงผล
* DOM ห้ามเป็นผู้ตัดสิน:
  * line break
  * text overflow
  * height ที่ใช้จริง
* DOM ใช้ได้เฉพาะ:
  * caret / selection
  * hit-testing
  * interaction

### G3. Text wrapping ต้อง deterministic

* input เดียวกัน → ผลลัพธ์ layout ต้องเหมือนเดิมเสมอ
* wrap ต้องไม่ขึ้นกับ:
  * timing
  * environment
  * DOM state
* measurement / segmentation ต้อง inject ได้

### G4. Wrap engine ต้องเป็น pure + cacheable

* wrap(text, style, constraints) → LayoutResult
* ไม่มี side effect
* cache ได้ด้วย key ที่ชัดเจน
* ต้องมี invalidation rule ชัด (font / size / width เปลี่ยน)

### G5. Editor = Preview, Core = Truth

* editor แสดงผลจาก LayoutResult
* editor ห้ามปรับ layout เองเพื่อ “ให้ดูดี”
* ถ้าดูไม่ดี = ปัญหาที่ core ไม่ใช่ UI

---

## H) Wrap, Reflow, and Text Layout Laws

หมวดนี้กำหนดกฎสูงสุดสำหรับการจัดข้อความ (wrap / reflow / line-break)
เป้าหมายหลัก: Editor, PDF, และ Export ต้องให้ผลลัพธ์เหมือนกันในระดับ LayoutResult

### H1. Single Layout Engine, Single LayoutResult

* ต้องมี layout engine เพียงชุดเดียว ในระบบ
* layout engine ต้องให้ผลลัพธ์เป็น LayoutResult
* editor / pdf / export ต้อง render จาก LayoutResult เดียวกัน
* ห้าม renderer ใด ๆ:
* ตัดบรรทัดเอง
* ปรับ layout เองเพื่อ “ให้ดูดี”

### H2. แยกบทบาท: Segmentation / Measurement / Decision

* การ wrap ต้องแยกเป็นขั้นตอนชัดเจน และ ห้ามปะปนหน้าที่
* Segmentation
* แปลง text → grapheme clusters
* ห้ามใช้ char / code unit เป็นหน่วยหลัก
* Break Opportunities
* ระบุ “ตำแหน่งที่อนุญาตให้ตัด”
* เป็นเพียง candidate ไม่ใช่คำตัดสิน
* Measurement
* วัดระยะของ grapheme จาก font metrics
* ต้องไม่ผูกกับ DOM/CSS
* Decision (Core Only)
* core เป็นผู้เลือกจุดตัดจริง
* ใช้ข้อมูลจาก (widths, break opportunities, box width, policy)
* ต้อง deterministic
* Provider ใด ๆ (ICU / font / platform) ห้ามตัดสินใจแทน core

### H3. Grapheme-first Rule

* หน่วยขั้นต่ำสุดของข้อความคือ grapheme cluster
* ห้ามตัดบรรทัดกลาง grapheme ไม่ว่ากรณีใด ๆ
* fallback ในกรณีคำยาวมาก:
* อนุญาตเฉพาะ hard-break ระดับ grapheme เท่านั้น

### H4. ICU & Language-aware Breaking Policy

* ICU (หรือระบบเทียบเท่า) ใช้เพื่อ:
* วิเคราะห์ภาษา
* ระบุ break opportunities ที่ถูกต้องตามภาษา
* ICU ไม่ใช่:
* layout engine
* measurement engine
* ICU version ต้องถูกล็อกและถือเป็นส่วนหนึ่งของ determinism
* Client / Server Rule
* ถ้า client ไม่มี ICU:
* ใช้ fallback ชั่วคราวได้ (space / ZWS / punctuation + grapheme)
* แต่ก่อน export / finalize ต้อง reconcile กับผล authoritative จาก server

### H5. Interactive Layout vs Authoritative Layout

ระบบต้องแยก 2 โหมดชัดเจน:

### H5.1 Interactive Mode (Client)

* ใช้ระหว่าง: พิมพ์ / ลาก / resize / zoom

* ต้อง:

* เร็ว

* ใช้ cache

* ใช้ single-flight

* ห้าม:

* เรียก network เป็นส่วนหนึ่งของ loop ต่อ keypress

### H5.2 Authoritative Mode (Server)

* ใช้ตอน: export PDF / print / finalize เอกสาร

* ต้องใช้:

* font metrics ชุดจริง

* ICU version ที่ล็อกแล้ว

* LayoutResult จากโหมดนี้ถือเป็น ความจริงสุดท้าย

### H6. Font Truth & Identity

* ฟอนต์ต้องอ้างอิงด้วย FontIdentity

* (fileHash, version, faceIndex)

* ห้ามใช้ชื่อ font-family เป็น source of truth

* fontSpec ที่มีผลต่อ layout ต้อง serialize ได้ เช่น:

* fontHash

* size

* weight / axis

* featuresKey

* เปลี่ยนฟอนต์หรือขนาด:

* ต้อง invalidate measurement และ layout อย่างชัดเจน

### H7. Space & Invisible Characters Rules

* U+0020 (space):

* เป็น break opportunity

* มีความกว้าง

* U+200B (Zero-Width Space):

* เป็น break opportunity

* ความกว้าง = 0

* ต้องไม่ render

* เมื่อ break ที่ space:

* trailing spaces ต้องไม่ render

* ต้องไม่ถูกนับความกว้างของบรรทัด

* ห้ามแทรก ZWS ลง text จริงโดยไม่จำเป็น

* ควรเก็บเป็น metadata / break positions แทน

* H8. Cache & Invalidation for Text Layout

* อนุญาต cache ได้เฉพาะ derived state และต้องมี rule ชัด:

* Segment Cache

* key: (textHash, ICUVersion)

* Break Cache

* key: (textHash, ICUVersion, breakMode)

* Measurement Cache

* key: (segmentsId, fontIdentity, fontSpecKey)

* Layout Cache (optional)

* key: (breaksId, measureId, boxWidth, wrapPolicyKey)

* กฎ

* เปลี่ยน text / ICU → invalidate segment + break

* เปลี่ยนฟอนต์ / ขนาด → invalidate measurement + layout

* เปลี่ยนกล่อง → invalidate layout เท่านั้น

* cache ต้องเป็น LRU หรือ size-bounded เสมอ

### H9. Single-flight Requirement

* งาน wrap / reflow ระหว่าง interaction ต้องเป็น single-flight:

* รับผลเฉพาะงานล่าสุด

* งานเก่าต้องถูกยกเลิกหรือ ignore

* ห้ามสะสม promise / queue ที่ทำให้ผลย้อนเวลา

### H10. Layout Invariants & Tests

* ต้องมีการตรวจสอบขั้นต่ำ:

* input เดียวกัน → LayoutResult ต้องเหมือนเดิมทุกครั้ง

* เปลี่ยน width → line break เปลี่ยนอย่าง deterministic

* ภาษาไทย:

* ห้ามตัดกลาง grapheme

* editor และ pdf ต้อง render จาก LayoutResult เดียวกัน (golden test)

## Final Rule

> ถ้ากฎข้อใดถูกละเมิด:
>
> * ต้องรู้ตัวว่าละเมิด
> * ต้องอธิบายได้ว่าทำไม
> * และต้องรู้ผลกระทบระยะยาว

Editor นี้ถูกออกแบบให้ **โตได้โดยไม่พัง**
ไม่ใช่แค่ให้ใช้งานได้วันนี้

> ข้อความในเอกสารนี้ถือเป็น **ข้อกำหนดระดับระบบ**
> ไม่ใช่ suggestion
> ทุก AI / tool / contributor ต้องถือเป็น constraint ก่อนตัดสินใจใด ๆ