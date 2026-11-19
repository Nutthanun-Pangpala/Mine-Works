-- =====================================================================
-- Optional demo data (fictional company and people) for trying the system.
-- Run once after schema.sql + seed.sql on an empty database. Demo employees
-- have no password; the first administrator is still created at /setup.
-- =====================================================================

-- keeps a company name already chosen at /setup; only fills in blanks
update companies set
  name_th = case when name_th = 'บริษัทของฉัน' then 'บริษัท ไมน์เวิร์คส์ จำกัด' else name_th end,
  name_en = case when name_en is null or name_en = 'My Company' then case when name_th = 'บริษัทของฉัน' then 'Mine Works Co., Ltd.' else name_en end else name_en end,
  phone = coalesce(phone, '02-000-0000'), address_th = coalesce(address_th, '99/9 อาคารตัวอย่าง ถนนตัวอย่าง'),
  subdistrict = coalesce(subdistrict, 'คลองเตย'), district = coalesce(district, 'คลองเตย'),
  province = coalesce(province, 'กรุงเทพมหานคร'), postcode = coalesce(postcode, '10110')
where code = 'C01';

insert into employees (code, company_id, branch_id, org_unit_id, position_id, shift_id, calendar_id, employment_type_id, status,
  start_date, probation_end_date, confirm_date, end_date, separation_reason_id, title, first_name, last_name, nickname, gender,
  birth_date, work_email, nationality, religion, marital_status, payment_method, bank_name, bank_account, salary,
  sso_enabled, pf_enabled, pf_employee_rate, pf_employer_rate, pf_join_date, login_enabled, clock_required)
select v.code, c.id, b.id, ou.id, p.id, s.id, cal.id, et.id, v.status,
  v.sd::date, v.sd::date + 119, case when v.status in ('confirmed','terminated') then v.sd::date + 119 end, v.ed::date,
  case when v.ed is not null then (select id from master_options where category = 'separation_reason' and name = 'ลาออก') end,
  v.title, v.fn, v.ln, v.nick, v.g, v.bd::date, 'emp' || v.code || '@mineworks.example', 'ไทย', 'พุทธ', v.marital,
  'bank', v.bank, '000-0-' || v.code || '-0', v.sal, true, v.pf, case when v.pf then 5 else 0 end, case when v.pf then 5 else 0 end,
  case when v.pf then v.sd::date + 119 end, false, true
from (values
  ('10001','นาย','ธนกร','ศรีสุข','กร','male','1975-05-12','2018-03-01',null,'confirmed','บริหาร','กรรมการผู้จัดการ','S1','MONTHLY',150000,true,'ธนาคารกสิกรไทย','สมรส'),
  ('10002','นาง','วรรณา','ใจงาม','วรรณ','female','1980-08-21','2019-01-07',null,'confirmed','บริหาร','รองกรรมการผู้จัดการ','S1','MONTHLY',110000,true,'ธนาคารกรุงเทพ','สมรส'),
  ('10003','นาย','ปิยะพงษ์','แก้วมณี','ปิยะ','male','1985-02-14','2020-06-01',null,'confirmed','เทคโนโลยีสารสนเทศ','ผู้จัดการแผนก','S1','MONTHLY',85000,true,'ธนาคารไทยพาณิชย์','สมรส'),
  ('10004','นาย','ณัฐวุฒิ','บุญมา','ณัฐ','male','1994-11-03','2022-04-18',null,'confirmed','เทคโนโลยีสารสนเทศ','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',42000,false,'ธนาคารกสิกรไทย','โสด'),
  ('10005','นางสาว','ศิริพร','คงดี','พร','female','1997-07-19','2023-09-01',null,'confirmed','เทคโนโลยีสารสนเทศ','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',38000,false,'ธนาคารกรุงไทย','โสด'),
  ('10006','นาง','กมลชนก','พรหมมา','กมล','female','1983-12-01','2019-11-11',null,'confirmed','บัญชีและการเงิน','ผู้จัดการแผนกบัญชีและการเงิน','S1','MONTHLY',80000,true,'ธนาคารกรุงเทพ','สมรส'),
  ('10007','นางสาว','สุดารัตน์','ทองดี','ดา','female','1993-11-25','2021-02-01',null,'confirmed','บัญชีและการเงิน','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',35000,false,'ธนาคารกสิกรไทย','โสด'),
  ('10008','นาย','อนุชา','วงศ์ใหญ่','ชา','male','1998-04-09','2024-07-15',null,'confirmed','บัญชีและการเงิน','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',32000,false,'ธนาคารไทยพาณิชย์','โสด'),
  ('10009','นางสาว','จิราภรณ์','สายทอง','จิ','female','1984-06-30','2020-01-06',null,'confirmed','บุคคล','ผู้จัดการแผนกทรัพยากรบุคคล','S1','MONTHLY',78000,true,'ธนาคารกรุงเทพ','โสด'),
  ('10010','นางสาว','พัชรินทร์','มีสุข','แพร','female','1996-09-17','2023-03-01',null,'confirmed','บุคคล','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',34000,false,'ธนาคารกสิกรไทย','โสด'),
  ('10011','นาย','ประเสริฐ','ดวงแก้ว','เสริฐ','male','1979-03-05','2018-08-20',null,'confirmed','คลังสินค้า','ผู้จัดการแผนก','S2','MONTHLY',65000,true,'ธนาคารกรุงไทย','สมรส'),
  ('10012','นาย','สมศักดิ์','เพชรรัตน์','ศักดิ์','male','1990-01-28','2021-10-04',null,'confirmed','คลังสินค้า','เจ้าหน้าที่ประสานงาน','S2','MONTHLY',26000,false,'ธนาคารกรุงไทย','สมรส'),
  ('10013','นาย','บุญเลิศ','จันทร์หอม','เลิศ','male','1995-10-10','2025-05-12',null,'confirmed','คลังสินค้า','พนักงานชั่วคราว','S2','DAILY',450,false,'ธนาคารกรุงไทย','โสด'),
  ('10014','นาย','วิชัย','สุขประเสริฐ','ชัย','male','1999-12-24','2026-06-01',null,'confirmed','คลังสินค้า','พนักงานชั่วคราว','S2','DAILY',450,false,'ธนาคารกรุงไทย','โสด'),
  ('10015','นางสาว','มณีรัตน์','ศรีวงศ์','มณี','female','2001-02-02','2026-10-01',null,'probation','คลังสินค้า','พนักงานชั่วคราว','S2','DAILY',420,false,'ธนาคารกรุงไทย','โสด'),
  ('10016','นาย','ธีรวัฒน์','แสงทอง','ธีร์','male','1982-07-07','2019-05-02',null,'confirmed','ขาย','ผู้จัดการแผนก','S1','MONTHLY',75000,true,'ธนาคารไทยพาณิชย์','สมรส'),
  ('10017','นางสาว','อรอุมา','นาคสวัสดิ์','อร','female','1992-05-15','2022-01-10',null,'confirmed','ขาย','เจ้าหน้าที่ประสานงานขาย','S1','MONTHLY',30000,false,'ธนาคารกสิกรไทย','โสด'),
  ('10018','นาย','กิตติพัฒน์','ทองคำ','กิต','male','1998-11-30','2026-09-14',null,'probation','ขาย','เจ้าหน้าที่ประสานงานขาย','S1','MONTHLY',28000,false,'ธนาคารกสิกรไทย','โสด'),
  ('10019','นางสาว','นภัสสร','รุ่งเรือง','นภ','female','1987-11-08','2021-03-15',null,'confirmed','การตลาด','ผู้จัดการแผนก','S1','MONTHLY',72000,true,'ธนาคารกรุงเทพ','โสด'),
  ('10020','นางสาว','ชลธิชา','บัวแก้ว','ชล','female','1996-03-21','2024-02-01',null,'confirmed','การตลาด','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',31000,false,'ธนาคารไทยพาณิชย์','โสด'),
  ('10021','นาย','ภานุวัฒน์','ศรีเมือง','ภานุ','male','1995-08-08','2023-06-01','2026-10-31','terminated','การตลาด','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',29000,false,'ธนาคารกสิกรไทย','โสด'),
  ('10022','นางสาว','สุนิสา','พึ่งบุญ','นิสา','female','2000-04-04','2026-11-16',null,'probation','เทคโนโลยีสารสนเทศ','เจ้าหน้าที่ประสานงาน','S1','MONTHLY',36000,false,'ธนาคารกสิกรไทย','โสด')
) as v(code, title, fn, ln, nick, g, bd, sd, ed, status, unit, pos, shift, et, sal, pf, bank, marital)
join companies c on c.code = 'C01'
join branches b on b.company_id = c.id
join org_units ou on ou.name = v.unit and ou.company_id = c.id
join positions p on p.name = v.pos
join shifts s on s.code = v.shift
join employment_types et on et.code = v.et
cross join lateral (select id from holiday_calendars order by is_default desc, id limit 1) cal
order by v.code;

update employees e set supervisor_id = s.id
from (values ('10002','10001'),('10003','10002'),('10004','10003'),('10005','10003'),('10022','10003'),('10006','10002'),('10007','10006'),
             ('10008','10006'),('10009','10002'),('10010','10009'),('10011','10002'),('10012','10011'),('10013','10011'),('10014','10011'),
             ('10015','10011'),('10016','10002'),('10017','10016'),('10018','10016'),('10019','10002'),('10020','10019'),('10021','10019')) as v(emp, sup)
join employees s on s.code = v.sup
where e.code = v.emp;

update org_units u set head_employee_id = e.id
from (values ('บริหาร','10001'),('เทคโนโลยีสารสนเทศ','10003'),('บัญชีและการเงิน','10006'),('บุคคล','10009'),('คลังสินค้า','10011'),('ขาย','10016'),('การตลาด','10019')) as v(unit, code)
join employees e on e.code = v.code
where u.name = v.unit;

update employees set login_enabled = false where code = '10021';

insert into user_roles (employee_id, role_id)
select e.id, r.id from (values ('10009','HR_MANAGER'),('10010','HR_STAFF'),('10010','HR_PAYROLL'),('10006','ACCOUNTANT'),('10003','IT')) as v(code, role)
join employees e on e.code = v.code join roles r on r.code = v.role
on conflict do nothing;

insert into salary_history (employee_id, effective_date, action, amount_before, amount_after)
select id, start_date, 'เริ่มงาน', null, case when code = '10004' then 38000 else salary end from employees where code like '1____';
insert into salary_history (employee_id, effective_date, action, amount_before, amount_after, note)
select id, '2026-04-01', 'salary_adjust', 38000, 42000, 'ปรับเงินเดือนประจำปี' from employees where code = '10004';

insert into payroll_cycles (company_id, employment_type_id, frequency, first_start_date, pay_rule)
select c.id, et.id, v.freq, '2026-01-01', 'last_day'
from (values ('MONTHLY','monthly'),('DAILY','semi')) as v(et, freq)
join companies c on c.code = 'C01' join employment_types et on et.code = v.et;

insert into employee_pay_items (employee_id, pay_item_id, amount, start_date)
select e.id, i.id, v.amount, '2026-01-01'
from (values ('10001','I03',10000),('10002','I03',8000),('10016','I03',5000),('10019','I03',5000)) as v(code, item, amount)
join employees e on e.code = v.code join pay_items i on i.code = v.item and i.kind = 'income';

insert into liabilities (employee_id, kind, pay_item_id, reference, total, installment, start_date, note)
select e.id, 'loan', (select id from pay_items where code = 'D002'), 'LN-2026-001', 30000, 2500, '2026-07-01', 'เงินกู้สวัสดิการพนักงาน'
from employees e where e.code = '10012';

insert into announcements (kind, title, body, publish_at, pinned)
values ('news', 'ยินดีต้อนรับสู่ระบบ HR ใหม่', 'ตั้งแต่เดือนนี้ พนักงานทุกคนสามารถลงเวลา ยื่นใบลา ขอ OT และดูสลิปเงินเดือนผ่านระบบนี้ได้', '2026-11-01', true),
       ('news', 'งานเลี้ยงปีใหม่ 2027', 'ขอเชิญพนักงานทุกท่านร่วมงานเลี้ยงปีใหม่ วันศุกร์ที่ 25 ธันวาคม 2026 เวลา 18:00 น.', '2026-11-15', false),
       ('policy', 'นโยบายการทำงานจากที่บ้าน', 'พนักงานสามารถทำงานจากที่บ้านได้สัปดาห์ละไม่เกิน 2 วัน โดยยื่นเอกสารปฏิบัติงานนอกสถานที่ล่วงหน้า', '2026-10-01', false);

insert into courses (title, category_id, description, url, duration_minutes, published)
select v.title, (select id from master_options where category = 'course_category' and name = v.cat), v.descr, null, v.mins, true
from (values ('ปฐมนิเทศพนักงานใหม่', 'พนักงานใหม่', 'ระเบียบบริษัท สวัสดิการ และการใช้ระบบ HR', 90),
             ('ความปลอดภัยในการทำงานคลังสินค้า', 'ระดับปฏิบัติการ', 'การยก การจัดเก็บ และการใช้อุปกรณ์อย่างปลอดภัย', 120),
             ('ภาวะผู้นำสำหรับหัวหน้างาน', 'ระดับหัวหน้างาน', 'การสื่อสาร การมอบหมายงาน และการให้ฟีดแบ็ก', 180)) as v(title, cat, descr, mins);

insert into course_enrollments (course_id, employee_id, status, score, completed_at)
select c.id, e.id, v.status, v.score, case when v.status = 'completed' then timestamptz '2026-11-10 16:00+07' end
from (values ('ปฐมนิเทศพนักงานใหม่','10022','in_progress',null),('ปฐมนิเทศพนักงานใหม่','10018','completed',92),('ปฐมนิเทศพนักงานใหม่','10015','assigned',null),
             ('ความปลอดภัยในการทำงานคลังสินค้า','10012','completed',85),('ความปลอดภัยในการทำงานคลังสินค้า','10013','completed',78),
             ('ความปลอดภัยในการทำงานคลังสินค้า','10014','in_progress',null),('ภาวะผู้นำสำหรับหัวหน้างาน','10003','completed',88),
             ('ภาวะผู้นำสำหรับหัวหน้างาน','10016','assigned',null)) as v(title, code, status, score)
join courses c on c.title = v.title join employees e on e.code = v.code;

-- ---- documents (requests + approval steps) ----
-- approved leave / offsite (one full day = 480 minutes)
with v(code, typ, sd, ed, days, detail, dtype, place) as (values
  ('10005','L03','2026-10-15','2026-10-15',1,'ไข้หวัด','leave',null),
  ('10007','L02','2026-11-09','2026-11-10',2,'เดินทางต่างจังหวัด','leave',null),
  ('10012','L01','2026-11-12','2026-11-12',1,'ติดต่อราชการส่วนตัว','leave',null),
  ('10020','L03','2026-10-21','2026-10-22',2,'ปวดท้อง มีใบรับรองแพทย์','leave',null),
  ('10017','F01','2026-11-18','2026-11-18',1,'นำเสนอสินค้าลูกค้ารายใหม่','offsite','บริษัทลูกค้า (ชลบุรี)')),
r as (
  insert into requests (employee_id, doc_type, sub_type_id, start_date, end_date, full_day, minutes, days, detail, payload, status, created_by, created_at, decided_at, applied_at)
  select e.id, v.dtype, lt.id, v.sd::date, v.ed::date, true, v.days * 480, v.days, v.detail,
         case when v.place is null then '{}'::jsonb else jsonb_build_object('place', v.place) end,
         'approved', e.id, (v.sd::date - 3 + time '09:00') at time zone 'Asia/Bangkok',
         (v.sd::date - 2 + time '10:00') at time zone 'Asia/Bangkok', (v.sd::date - 2 + time '10:00') at time zone 'Asia/Bangkok'
  from v join employees e on e.code = v.code join leave_types lt on lt.code = v.typ
  returning id, employee_id, decided_at)
insert into request_steps (request_id, seq, approver_id, status, decided_by, decided_at)
select r.id, 1, e.supervisor_id, 'approved', e.supervisor_id, r.decided_at from r join employees e on e.id = r.employee_id;

-- pending leave
with v(code, typ, sd, ed, days, detail) as (values
  ('10004','L02','2026-11-26','2026-11-27',2,'พาครอบครัวเที่ยว'),
  ('10020','L01','2026-11-24','2026-11-24',1,'ธุระส่วนตัวที่ธนาคาร')),
r as (
  insert into requests (employee_id, doc_type, sub_type_id, start_date, end_date, full_day, minutes, days, detail, status, created_by, created_at)
  select e.id, 'leave', lt.id, v.sd::date, v.ed::date, true, v.days * 480, v.days, v.detail, 'pending', e.id, timestamptz '2026-11-18 14:00+07'
  from v join employees e on e.code = v.code join leave_types lt on lt.code = v.typ
  returning id, employee_id)
insert into request_steps (request_id, seq, approver_id, status)
select r.id, 1, e.supervisor_id, 'pending' from r join employees e on e.id = r.employee_id;

-- OT (ot2 = overtime on a working day, 1.5x)
with v(code, d, st, et, mins, status, detail) as (values
  ('10004','2026-10-28','17:30','20:30',180,'approved','อัปเดตระบบเซิร์ฟเวอร์'),
  ('10004','2026-11-17','17:30','20:30',180,'approved','ย้ายฐานข้อมูล'),
  ('10012','2026-11-11','14:00','17:00',180,'approved','รับสินค้าเข้าคลังล็อตใหญ่'),
  ('10013','2026-11-11','14:00','17:00',180,'approved','รับสินค้าเข้าคลังล็อตใหญ่'),
  ('10008','2026-11-18','17:30','19:30',120,'pending','ปิดงบประจำเดือน')),
r as (
  insert into requests (employee_id, doc_type, start_date, end_date, start_time, end_time, full_day, minutes, reason_id, detail, payload, status, created_by, created_at, decided_at, applied_at)
  select e.id, 'ot', v.d::date, v.d::date, v.st::time, v.et::time, false, v.mins,
         (select id from master_options where category = 'ot_reason' and name = 'งานเร่งด่วน'), v.detail, '{"ot_kind":"ot2"}',
         v.status, e.id, (v.d::date + time '12:00') at time zone 'Asia/Bangkok',
         case when v.status = 'approved' then (v.d::date + time '16:00') at time zone 'Asia/Bangkok' end,
         case when v.status = 'approved' then (v.d::date + time '16:00') at time zone 'Asia/Bangkok' end
  from v join employees e on e.code = v.code
  returning id, employee_id, status, decided_at)
insert into request_steps (request_id, seq, approver_id, status, decided_by, decided_at)
select r.id, 1, e.supervisor_id, r.status, case when r.status = 'approved' then e.supervisor_id end, r.decided_at
from r join employees e on e.id = r.employee_id;

-- time certification (forgot to clock out) + the clock record it created
with r as (
  insert into requests (employee_id, doc_type, sub_type_id, start_date, end_date, end_time, detail, payload, status, created_by, created_at, decided_at, applied_at)
  select e.id, 'certify', (select id from leave_types where code = 'C01'), '2026-11-13', '2026-11-13', '17:05',
         'ลืมทาบบัตรออก', '{"in_time":null,"out_time":"17:05","out_next_day":false}', 'approved', e.id,
         timestamptz '2026-11-14 09:00+07', timestamptz '2026-11-14 11:00+07', timestamptz '2026-11-14 11:00+07'
  from employees e where e.code = '10005'
  returning id, employee_id),
s as (insert into request_steps (request_id, seq, approver_id, status, decided_by, decided_at)
      select r.id, 1, e.supervisor_id, 'approved', e.supervisor_id, timestamptz '2026-11-14 11:00+07' from r join employees e on e.id = r.employee_id)
insert into clock_records (employee_id, ts, source, note)
select r.employee_id, timestamptz '2026-11-13 17:05+07', 'certify', 'req:' || r.id from r;

-- welfare claim (pending at supervisor, then HR) and an approved expense claim
with r as (
  insert into requests (employee_id, doc_type, sub_type_id, start_date, end_date, amount, detail, payload, status, created_by, created_at)
  select e.id, 'welfare', (select id from welfare_types order by id limit 1), '2026-11-16', '2026-11-16', 1200,
         'ค่ารักษาพยาบาล คลินิกทันตกรรม', '{"category":null}', 'pending', e.id, timestamptz '2026-11-17 10:00+07'
  from employees e where e.code = '10017'
  returning id, employee_id)
insert into request_steps (request_id, seq, approver_id, role_id, status)
select r.id, 1, e.supervisor_id, null, 'pending' from r join employees e on e.id = r.employee_id
union all
select r.id, 2, null, (select id from roles where code = 'HR_STAFF'), 'waiting' from r;

with r as (
  insert into requests (employee_id, doc_type, start_date, end_date, amount, detail, payload, status, created_by, created_at, decided_at, applied_at)
  select e.id, 'expense', '2026-11-06', '2026-11-06', 850, 'ค่าแท็กซี่และทางด่วนไปพบลูกค้า', '{"category":"ค่าเดินทาง"}', 'approved', e.id,
         timestamptz '2026-11-06 18:00+07', timestamptz '2026-11-09 15:00+07', timestamptz '2026-11-09 15:00+07'
  from employees e where e.code = '10016'
  returning id, employee_id)
insert into request_steps (request_id, seq, approver_id, role_id, status, decided_by, decided_at)
select r.id, 1, e.supervisor_id, null, 'approved', e.supervisor_id, timestamptz '2026-11-07 09:00+07' from r join employees e on e.id = r.employee_id
union all
select r.id, 2, null, (select id from roles where code = 'ACCOUNTANT'), 'approved', (select id from employees where code = '10006'), timestamptz '2026-11-09 15:00+07' from r;

-- salary certificate request (pending at HR staff)
with r as (
  insert into requests (employee_id, doc_type, start_date, detail, payload, status, created_by, created_at)
  select e.id, 'doc', '2026-11-19', 'ใช้ประกอบการขอสินเชื่อบ้าน', '{"cert":"salary_cert","copies":1,"lang":"th"}', 'pending', e.id, timestamptz '2026-11-19 09:30+07'
  from employees e where e.code = '10008'
  returning id)
insert into request_steps (request_id, seq, role_id, status) select r.id, 1, (select id from roles where code = 'HR_STAFF'), 'pending' from r;

-- warning letter issued by HR
with r as (
  insert into requests (employee_id, doc_type, start_date, end_date, detail, payload, status, created_by, created_at, decided_at, applied_at)
  select e.id, 'warning', '2026-11-03', '2026-11-03', 'มาทำงานสายเกิน 30 นาที จำนวน 4 ครั้งในเดือนตุลาคม 2026 โดยไม่แจ้งล่วงหน้า',
         '{"level":"written1"}', 'approved', (select id from employees where code = '10009'),
         timestamptz '2026-11-03 10:00+07', timestamptz '2026-11-03 10:00+07', timestamptz '2026-11-03 10:00+07'
  from employees e where e.code = '10012'
  returning id)
insert into request_steps (request_id, seq, role_id, status, decided_by, decided_at)
select r.id, 1, (select id from roles where code = 'HR_MANAGER'), 'approved', (select id from employees where code = '10009'), timestamptz '2026-11-03 10:00+07' from r;

-- resignation (personnel action) of 10021, effective 31 Oct 2026
with r as (
  insert into requests (employee_id, doc_type, start_date, end_date, detail, payload, status, created_by, created_at, decided_at, applied_at)
  select e.id, 'action', '2026-10-31', '2026-10-31', 'ลาออกเพื่อศึกษาต่อ',
         jsonb_build_object('kind', 'terminate', 'separation_reason_id', (select id from master_options where category = 'separation_reason' and name = 'ลาออก')),
         'approved', (select id from employees where code = '10009'), timestamptz '2026-10-01 10:00+07', timestamptz '2026-10-02 10:00+07', timestamptz '2026-10-31 00:05+07'
  from employees e where e.code = '10021'
  returning id)
insert into request_steps (request_id, seq, role_id, status, decided_by, decided_at)
select r.id, 1, (select id from roles where code = 'HR_MANAGER'), 'approved', (select id from employees where code = '10009'), timestamptz '2026-10-02 10:00+07' from r;

-- ---- clock records 1 Oct – 19 Nov 2026 (working days, varied times, a few late / absent days) ----
insert into clock_records (employee_id, ts, source)
select e.id, (d::date + s.start_time - interval '20 minutes'
              + make_interval(mins => (e.id * 7 + extract(day from d)::int * 13) % 40
                                     + case when (e.id + extract(day from d)::int) % 9 = 0 then 40 else 0 end)) at time zone 'Asia/Bangkok', 'device'
from employees e join shifts s on s.id = e.shift_id
cross join generate_series(date '2026-10-01', date '2026-11-19', interval '1 day') d
where e.code like '1____' and extract(isodow from d) < 6 and d >= e.start_date and (e.end_date is null or d <= e.end_date)
  and (e.id * extract(day from d)::int) % 29 <> 7
  and not exists (select 1 from holidays h where h.calendar_id = e.calendar_id and h.holiday_date = d::date and h.active)
  and not exists (select 1 from requests r where r.employee_id = e.id and r.doc_type in ('leave','offsite') and r.status = 'approved'
                  and d::date between r.start_date and r.end_date)
union all
select e.id, (d::date + s.end_time + make_interval(mins => (e.id * 3 + extract(day from d)::int) % 25)) at time zone 'Asia/Bangkok', 'device'
from employees e join shifts s on s.id = e.shift_id
cross join generate_series(date '2026-10-01', date '2026-11-19', interval '1 day') d
where e.code like '1____' and extract(isodow from d) < 6 and d >= e.start_date and (e.end_date is null or d <= e.end_date)
  and (e.id * extract(day from d)::int) % 29 <> 7
  and not (e.code = '10005' and d::date = date '2026-11-13')
  and not exists (select 1 from holidays h where h.calendar_id = e.calendar_id and h.holiday_date = d::date and h.active)
  and not exists (select 1 from requests r where r.employee_id = e.id and r.doc_type in ('leave','offsite') and r.status = 'approved'
                  and d::date between r.start_date and r.end_date);

-- daily report samples
insert into daily_reports (employee_id, report_date, mood, body)
select e.id, d::date, 3 + (e.id + extract(day from d)::int) % 3, v.body
from (values ('10004','ตรวจสอบระบบสำรองข้อมูล และแก้ไขปัญหาเครื่องพิมพ์ชั้น 3'),('10017','โทรติดตามลูกค้า 12 ราย นัดนำเสนอ 2 ราย'),
             ('10012','รับสินค้าเข้าคลัง 3 ล็อต ตรวจนับสต็อกโซน B')) as v(code, body)
join employees e on e.code = v.code
cross join generate_series(date '2026-11-16', date '2026-11-19', interval '1 day') d;
