เอกสารนี้กำหนดกติกาสำหรับ AI ทุกตัว ที่เข้ามาเขียนหรือแก้ไขโค้ดใน repository นี้
เป้าหมายหลัก: เพิ่มความสามารถ โดยไม่ทำลายเสถียรภาพและตัวตนของระบบ

หากคำขอใด ขัดกับกฎในเอกสารนี้หรือ Editor Constitution
AI ต้องหยุดและขอคำยืนยันก่อนดำเนินการต่อ

0. Read First (Non-Negotiable)

AI ต้องเข้าใจและยอมรับข้อเท็จจริงต่อไปนี้ก่อนทำงาน:

Document Model (DocumentJson) คือ Source of Truth เดียว

UI ไม่มีสิทธิ์ถือหรือแก้ document

การแก้ document ต้องผ่าน mutation channel เดียว

ผลลัพธ์ต้อง deterministic

UI state เป็นของชั่วคราวและทิ้งได้

Core logic ต้องไม่พึ่ง DOM

Renderer มีหน้าที่แสดงผล ไม่ใช่ตัดสินใจ

Virtualization เป็น optimization เท่านั้น

Document ต้อง migrate ก่อนใช้งาน

ถ้าไม่แน่ใจ ห้ามเปลี่ยน architecture

1. Scope of AI Responsibility

AI สามารถ:

เพิ่ม feature ที่อยู่ในกรอบ architecture เดิม

แก้ bug ที่ระบุชัดเจน

เพิ่ม guard / invariant / validation

ปรับปรุง readability โดยไม่เปลี่ยน behavior

เพิ่ม test / assertion / runtime check

AI ห้าม:

เปลี่ยน Source of Truth

เพิ่ม state ใหม่ที่ซ้ำซ้อนกับ document

รีแฟกเตอร์โครงสร้างใหญ่โดยไม่ขออนุญาต

รวม core logic เข้ากับ UI / DOM

แก้ behavior โดยไม่อธิบายผลกระทบ

2. Required Working Process

ทุกครั้งที่ AI จะเขียนหรือแก้โค้ด ต้องทำตามลำดับนี้:

2.1 Understand the Rules

อ่าน EDITOR_CONSTITUTION.md

ถามตัวเองว่า:

สิ่งที่จะทำ แตะความจริงของระบบหรือไม่

2.2 State the Intent

ก่อนแก้โค้ด AI ต้องระบุ:

กำลังแก้ปัญหาอะไร

อยู่ใน layer ไหน (core / ui / adapter / export)

ไม่ละเมิดกฎข้อใด

2.3 Minimal Change Principle

แก้ให้น้อยที่สุด

ห้าม “เผื่ออนาคต” ถ้าไม่จำเป็น

ห้าม refactor ถ้าไม่ได้แก้ bug หรือ risk จริง

3. Determinism & Safety Rules

AI ต้องตรวจสอบเสมอว่าโค้ดที่เขียน:

input เดียว → output เหมือนเดิม

ไม่ผูกกับ:

เวลา

random

DOM state

dependency ภายนอกต้อง inject ได้

ถ้าจำเป็นต้องใช้สิ่งเหล่านี้:

ต้อง isolate

ต้องอธิบายผลกระทบ

4. UI-Specific Rules

UI state ใช้ได้เฉพาะ:

preview

interaction

transient flags

UI ห้าม commit document

drag / resize:

ระหว่างทำ = uiState

ตอนจบ = commit operation เดียว

5. Text Layout & Rendering Awareness

AI ต้องเข้าใจว่า:

LayoutResult คือความจริงของการจัดข้อความ

renderer ห้าม:

ตัดบรรทัดเอง

ปรับ layout เพื่อ “ให้ดูดี”

ถ้าพบว่าการแสดงผลดูผิด:

ให้แก้ที่ core/layout logic

ไม่แก้ที่ UI

รายละเอียดเชิงลึก (ถ้ามี) อยู่ใน TEXT_LAYOUT_SPEC.md

6. Allowed Exceptions Pattern

ถ้า AI จำเป็นต้องฝ่าฝืนกฎบางข้อ ต้องรายงานในรูปแบบนี้:

Exception Requested:
- Rule violated:
- Reason:
- Scope:
- Invariant preserved:
- Cleanup / reconciliation plan:


หากไม่สามารถอธิบายครบ ห้ามดำเนินการ

7. Output Requirements

เมื่อ AI ส่งงาน ต้องแนบ:

สิ่งที่เปลี่ยน

เหตุผล

ผลกระทบ

วิธีทดสอบ

ถ้าไม่มี test:

ต้องบอก manual verification checklist

Final Reminder

AI ในระบบนี้
ไม่ใช่ “คนเขียนโค้ดอิสระ”
แต่คือ ผู้ช่วยภายใต้กฎหมายเดียวกับมนุษย์

ถ้าการเปลี่ยนแปลงใด:

ทำให้ความจริงไม่ชัด

ทำให้ผลลัพธ์ไม่ deterministic

หรือทำให้ UI เริ่ม “คิดแทน core”

AI ต้องหยุดและถามก่อนเสมอ