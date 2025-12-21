Editor Constitution (10 ข้อ)

DocumentJson คือ source of truth เดียว

UI ห้ามมี “สำเนา doc” อีกก้อน

derive อะไรให้ derive จาก doc เท่านั้น

แก้ doc ต้องผ่านช่องทางเดียว

ทุกการแก้ = dispatch(action) หรือ apply(op) เท่านั้น

ห้าม setState แก้ doc กระจัดกระจายหลายไฟล์

Node order คือ z-index

ลำดับใน nodeOrderByPageId[pageId] = ลำดับทับซ้อน

ห้ามมี z หรือ sort แอบใน UI

UI state แยกจาก doc state

zoom/mode/activePageId/selection/hover/flags อยู่ใน store UI

doc state = เฉพาะข้อมูลเอกสาร

ทุก coordinate อยู่ใน “unit เดียว” ในแกนหลัก

เลือก pui หรือ px แล้วล็อก (แนะนำ pui)

render ค่อยแปลงเป็น px ทีเดียวที่ขอบ UI

ห้ามผูก business logic กับ DOM

การคำนวณ layout สำคัญ (ตำแหน่ง/ขนาด/หน้า) ต้องทำได้โดยไม่พึ่ง DOM

DOM ใช้แค่เพื่อ interaction/measure ที่เลี่ยงไม่ได้

Virtualization เป็นแค่ optimization

ระบบต้อง “คิดได้” แม้หน้ายังไม่ mount

scrollTo/selection ต้องทำงานโดยอิง metrics/layout model ไม่ใช่อิงว่าหน้า render อยู่ไหม

Scroll/active page ต้อง deterministic

มี rule ชัด: threshold, tie-break, และกัน programmatic vs manual

ห้าม “กระพริบ” เพราะ observer หลายหน้าแย่งกัน

Command = atomic + reversible

action/op ทุกอันต้อง:

atomic (ทำครั้งเดียวจบ)

reversible (ทำ undo ได้)

อะไรที่เป็น drag ให้ใช้ preview ระหว่างลาก แล้ว commit ตอนปล่อย

I/O แยกเลเยอร์

import/export/render (pdf/image) ต้องอยู่นอก core editor state

editor-core ไม่รู้จัก API/ไฟล์/ฐานข้อมูลโดยตรง