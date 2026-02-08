# AI_CONTRIBUTING.md

เอกสารนี้กำหนดกติกาสำหรับ AI ทุกตัว
ที่เข้ามาเขียนหรือแก้ไขโค้ดใน repository นี้

เป้าหมายหลัก:
เพิ่มความสามารถของระบบ โดยไม่ทำลาย
- ความเสถียร
- ความ deterministic
- โครงสร้างสถาปัตยกรรม
- ตัวตนของ editor

---

## Precedence (Non-Negotiable)

ลำดับกฎหมายที่ AI ต้องยึดถือ:

1) EDITOR_CONSTITUTION.md (กฎสูงสุด)
2) เอกสารนี้ (กฎการทำงานของ AI)

หากพบความขัดแย้ง:
**ต้องยึด EDITOR_CONSTITUTION.md เสมอ**

เอกสารนี้ไม่สามารถ override Constitution ได้

---

## 0. Read First (Non-Negotiable)

ก่อนเริ่มงาน AI ต้องเข้าใจและยอมรับข้อเท็จจริงต่อไปนี้:

- Document Model (DocumentJson) คือ Source of Truth เดียว
- UI ไม่มีสิทธิ์ถือหรือแก้ document
- การแก้ document ต้องผ่าน mutation channel เดียว
- ทุกการแก้ต้อง deterministic
- UI state เป็นของชั่วคราวและทิ้งได้
- Core logic ต้องไม่พึ่ง DOM
- Renderer มีหน้าที่แสดงผล ไม่ใช่ตัดสินใจ
- Virtualization เป็น optimization เท่านั้น
- Document ต้อง migrate ก่อนใช้งาน
- Document geometry ต้องเก็บเป็น **pt100 (integer) เท่านั้น**
- Unit conversion ทำได้เฉพาะที่ boundary (UI layer)
- editor-core ห้ามแปลง unit
- ถ้าไม่แน่ใจ **ห้ามเปลี่ยน architecture**

---

## 1. Scope of AI Responsibility

### AI สามารถ:
- เพิ่ม feature ที่อยู่ในกรอบ architecture เดิม
- แก้ bug ที่ระบุชัดเจน
- เพิ่ม guard / invariant / validation
- ปรับปรุง readability โดยไม่เปลี่ยน behavior
- เพิ่ม test / assertion / runtime check

### AI ห้าม:
- เปลี่ยน Source of Truth
- เพิ่ม state ใหม่ที่ซ้ำซ้อนกับ document
- เปลี่ยน schema หรือ migration โดยไม่ขออนุญาต
- รีแฟกเตอร์โครงสร้างใหญ่โดยไม่ขออนุญาต
- รวม core logic เข้ากับ UI / DOM
- เปลี่ยน unit policy หรือ conversion rule
- แก้ behavior โดยไม่อธิบายผลกระทบ

---

## 2. Required Working Process

ทุกครั้งที่ AI จะเขียนหรือแก้โค้ด ต้องทำตามลำดับนี้:

### 2.1 Understand the Rules
- อ่าน EDITOR_CONSTITUTION.md
- ตรวจสอบว่าการเปลี่ยนแปลง:
  - แตะความจริงของระบบหรือไม่
  - แตะ document / unit / determinism หรือไม่

### 2.2 State the Intent
ก่อนแก้โค้ด AI ต้องระบุให้ชัด:
- กำลังแก้ปัญหาอะไร
- อยู่ใน layer ไหน (core / ui / renderer / adapter)
- ไม่ละเมิดกฎข้อใดใน Constitution

### 2.3 Minimal Change Principle
- แก้ให้น้อยที่สุด
- ห้าม “เผื่ออนาคต”
- ห้าม refactor ถ้าไม่ได้แก้ bug หรือ risk จริง

---

## 3. Determinism & Safety Rules

AI ต้องตรวจสอบเสมอว่าโค้ดที่เขียน:

- input เดียว → output เหมือนเดิม
- ไม่ผูกกับ:
  - เวลา
  - random
  - DOM state

ถ้าจำเป็นต้องใช้ dependency ภายนอก:
- ต้อง inject ได้
- ต้อง isolate
- ต้องอธิบายผลกระทบ

---

## 4. UI-Specific Rules

- UI state ใช้ได้เฉพาะ:
  - preview
  - interaction
  - transient flags

- UI ห้าม commit document โดยตรง

- drag / resize:
  - ระหว่างทำ = uiState (preview)
  - ตอนจบ = commit operation เดียว (pt100 เท่านั้น)

- UI อาจใช้ float ระหว่าง interaction
- ก่อน dispatch ทุกค่าต้องถูก convert เป็น pt100

---

## 5. Text Layout & Rendering Awareness

AI ต้องเข้าใจว่า:

- LayoutResult คือความจริงของการจัดข้อความ
- renderer ห้าม:
  - ตัดบรรทัดเอง
  - ปรับ layout เพื่อ “ให้ดูดี”

ถ้าพบว่าการแสดงผลดูผิด:
- แก้ที่ core / layout logic
- ห้ามแก้ที่ UI หรือ renderer

รายละเอียดเชิงลึกอยู่ใน TEXT_LAYOUT_SPEC.md (ถ้ามี)

---

## 6. Allowed Exceptions Pattern

หาก AI จำเป็นต้องฝ่าฝืนกฎบางข้อ
ต้องรายงานในรูปแบบนี้เท่านั้น:

Exception Requested:
- Rule violated:
- Reason:
- Scope:
- Invariant preserved:
- Cleanup / reconciliation plan:

หากอธิบายไม่ครบ:
**ห้ามดำเนินการต่อ**

---

## 7. When AI MUST Ask for Confirmation

AI ต้องหยุดและขอคำยืนยันก่อนทันที หากการเปลี่ยนแปลงเกี่ยวข้องกับ:

- document schema หรือ migration
- unit storage / conversion policy
- mutation channel / undo model
- ID generation strategy
- การย้าย logic ข้าม layer
- การเปลี่ยน Source of Truth
- การทำให้ผลลัพธ์ไม่ deterministic

---

## 8. Output Requirements

เมื่อ AI ส่งงาน ต้องแนบ:

- สิ่งที่เปลี่ยน
- เหตุผล
- ผลกระทบ
- วิธีทดสอบ

ถ้าไม่มี test:
- ต้องให้ manual verification checklist

---

## Final Reminder

AI ในระบบนี้
ไม่ใช่ “คนเขียนโค้ดอิสระ”

แต่คือ **ผู้ช่วยภายใต้กฎหมายเดียวกับมนุษย์**

ถ้าการเปลี่ยนแปลงใด:
- ทำให้ความจริงไม่ชัด
- ทำให้ผลลัพธ์ไม่ deterministic
- หรือทำให้ UI เริ่ม “คิดแทน core”

**AI ต้องหยุดและถามก่อนเสมอ**
