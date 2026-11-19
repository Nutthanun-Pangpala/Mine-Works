-- =====================================================================
-- Default data (mirrors the defaults empeo ships with). Safe to run once
-- after schema.sql. Create the first administrator at /setup afterwards.
-- =====================================================================

-- ---------- Settings ----------
insert into settings (key, value) values
('org', '{"emp_code":{"mode":"standard","prefix":"","digits":5},"newsfeed":"all","passcode":"dob","show_mobile":false,"show_birthday":true,"invitation_code":"","clock_verify":"none","daily_report":false,"expense_backdate_days":60,"expense_cutoff_day":25,"pnd_basis":"period_end","theme":"#0f5f5c"}'),
('sso', '{"base_min":1650,"base_max":17500,"min":83,"max":875,"rate_employee":5,"rate_employer":5}'),
('ewf', '{"start":"2027-01-01","rate_employee":0.25,"rate_employer":0.25}'),
('tax', '{"expense_rate":50,"expense_cap":100000,"personal":60000,"brackets":[[150000,0],[300000,5],[500000,10],[750000,15],[1000000,20],[2000000,25],[5000000,30],[null,35]]}'),
('features', '{"learn":true,"welfare":true,"expense":true,"warning":true,"actions":true,"evaluation":false,"goals":false,"skills":false,"rewards":false,"recruit":false,"timesheet":false,"chat":false}'),
('notifications', '{"monthly_day":1,"monthly_recipients":"","new_starters":true,"probation_due":true,"contract_due":true,"anniversary":true,"retirement":true,"birthdays":true,"work_permit":true,"profile_done":false,"action_approved":true,"separation":true,"device_offline":false,"new_employee_to_supervisor":true,"terminated_disable":true,"absent_3_days":true}')
on conflict (key) do nothing;

-- ---------- Company ----------
insert into companies (code, name_th, name_en, conditions, ot_rules, doc_settings, slip_settings) values
('C01', 'บริษัทของฉัน', 'My Company',
 '{"hours_per_day":8,"hours_from_shift":false,"annual_cutoff":"01-01","late_grace_min":0,"late_deduct":false,"absent_after_min":240,"absent_deduct":true,"score":{"every":1,"absent":10,"no_clock":5,"certify":2,"late":2,"sick":1,"sick_file":0,"personal":1,"ordination":0,"maternity":0},"shift_backdate":true,"shift_backdate_days":30,"supervisor_change_shift":true,"probation_days":119,"prorate_before_day":15,"half_month_from_15":true,"retire_male":60,"retire_female":60,"count_month_if_last_day_after":15,"self_resign":false,"auto_approve_separation":false,"diligence_amount":0,"diligence_step":0,"diligence_max":0}',
 '{"min_minutes":30,"max_docs_per_day":0,"allow_backdate":true,"backdate_days":30,"after_probation":false,"break_mode":"once","break_types":["after"],"break_minutes":0,"break_after_minutes":0,"rounding_minutes":0,"weekly_cap_hours":36,"holiday_rate_by_shift":true,"abnormal_day_ot":true,"flex_full_ot":false}',
 '{"letterhead":true,"paper":"A4","signers":{}}',
 '{"employee_choose":false,"auto_send":false,"show_unit":"auto"}')
on conflict (code) do nothing;

insert into branches (company_id, code, name, sso_branch_no)
select id, '00000', 'สำนักงานใหญ่', '000000' from companies where code = 'C01'
on conflict do nothing;

-- ---------- Position levels ----------
insert into position_levels (code, name, name_en, description, rank) values
('CEO','CEO','CEO','ประธานเจ้าหน้าที่บริหาร',10),
('E','E','E','ผู้อำนวยการ',20),
('M','M','M','ผู้จัดการ',30),
('O3','O3','O3','หัวหน้างาน',40),
('O2','O2','O2','เจ้าหน้าที่อาวุโส',50),
('O1','O1','O1','เจ้าหน้าที่',60),
('T','T','T','พนักงานชั่วคราว',70),
('P','P','P','นักศึกษาฝึกงาน',80)
on conflict (code) do nothing;

insert into positions (name, name_en, level_id)
select v.name, v.name_en, l.id from (values
  ('กรรมการผู้จัดการ','Managing Director','CEO'),
  ('รองกรรมการผู้จัดการ','Deputy Managing Director','E'),
  ('ผู้จัดการแผนก','Department Manager','M'),
  ('ผู้จัดการแผนกทรัพยากรบุคคล','Human Resources Manager','M'),
  ('ผู้จัดการแผนกบัญชีและการเงิน','Accounting & Finance Manager','M'),
  ('เจ้าหน้าที่ประสานงาน','Coordinator','O1'),
  ('เจ้าหน้าที่ประสานงานขาย','Sales Coordinator','O1'),
  ('พนักงานชั่วคราว','Part-time Officer','T')
) v(name, name_en, lvl) join position_levels l on l.code = v.lvl
where not exists (select 1 from positions);

insert into org_units (company_id, kind, code, name, sort)
select c.id, 'division', v.code, v.name, v.sort from companies c, (values
  ('IT','เทคโนโลยีสารสนเทศ',1),('ACC','บัญชีและการเงิน',2),('ADM','บริหาร',3),('HR','บุคคล',4),
  ('WH','คลังสินค้า',5),('SAL','ขาย',6),('MKT','การตลาด',7)
) v(code, name, sort)
where c.code = 'C01' and not exists (select 1 from org_units);

-- ---------- Master options ----------
insert into master_options (category, name, name_en, description, sort)
select * from (values
  ('employee_type','ประจำ','Permanent',null,1),
  ('employee_type','พาร์ทไทม์','Part-time',null,2),
  ('employee_type','ฝึกงาน','Intern',null,3),
  ('employee_type','ชั่วคราว','Temporary',null,4),
  ('employee_type','รายวัน','Daily',null,5),
  ('occupation','เจ้าของกิจการ',null,null,1),('occupation','พนักงานบริษัทเอกชน',null,null,2),
  ('occupation','พนักงานรัฐวิสาหกิจ',null,null,3),('occupation','เกษตรกร',null,null,4),
  ('occupation','รับจ้าง',null,null,5),('occupation','อาชีพอิสระ',null,null,6),
  ('occupation','รับราชการ',null,null,7),('occupation','แพทย์',null,null,8),
  ('company_rule','แต่งกายให้เรียบร้อยตามยูนิฟอร์มของบริษัท',null,null,1),
  ('company_rule','ช่วยเหลือ สนับสนุน ชักจูง รู้เห็นเป็นใจ ต่อการกระทำผิดของพนักงานอื่น',null,null,2),
  ('company_rule','เปิดเผยข้อมูลหรือปกปิดข้อเท็จจริง เป็นเหตุให้บริษัทเสียหาย',null,null,3),
  ('company_rule','เสพสุรา หรือสารเสพติด ภายในบริษัท',null,null,4),
  ('company_rule','เปิดเผย ค่าจ้างหรือเงินเดือน ให้พนักงานท่านอื่นทราบ',null,null,5),
  ('attachment_type','สำเนาบัตรประชาชนเเละทะเบียนบ้าน',null,'สำเนาเอกสารพร้อมลายเซ็นรับรองของพนักงาน สำหรับการยืนยันข้อมูลส่วนตัว และที่อยู่ของพนักงาน',1),
  ('attachment_type','สัญญาการจ้างงาน',null,'สัญญาที่กำหนดข้อตกลงการจ้างงาน และเงื่อนไขการทำงานของบริษัท',2),
  ('ot_reason','งานเร่งด่วน',null,'งานที่ถูกกำหนดให้ส่งมอบเร็วกว่าปกติ ทำในเวลางานไม่ทัน',1),
  ('ot_reason','งานต่อเนื่อง',null,'งานที่เริ่มแล้วต้องทำให้จบในคราวเดียว',2),
  ('ot_reason','ปฏิบัติงานแทน',null,'ทำงานแทนคนที่ไม่อยู่ในกะหรือตำแหน่งที่ยังว่าง',3),
  ('ot_reason','กิจกรรมเฉพาะกิจ',null,'งานหรือกิจกรรมที่จัดขึ้นเป็นครั้งคราวนอกเวลาทำงาน',4),
  ('ot_reason','ปัญหาฉุกเฉิน',null,'เหตุขัดข้องที่ไม่คาดคิด ต้องเข้าแก้ไขทันที',5),
  ('separation_reason','ลาออก',null,'พนักงานแสดงความประสงค์ขอยุติสัญญาจ้างด้วยความสมัครใจ',1),
  ('separation_reason','เลิกจ้าง',null,'การยุติสัญญาจ้างอันเนื่องมาจากเหตุผลต่างๆ',2),
  ('separation_reason','ครบกำหนดสัญญาจ้าง',null,null,3),
  ('separation_reason','เกษียณอายุ',null,null,4),
  ('separation_reason','ไม่ผ่านทดลองงาน',null,null,5),
  ('separation_reason','เหตุผลด้านสุขภาพ',null,null,6),
  ('separation_reason','ประสิทธิภาพการทำงาน',null,null,7),
  ('separation_reason','เสียชีวิต',null,null,8),
  ('resign_reason','โอกาสความก้าวหน้าในงาน',null,null,1),
  ('resign_reason','ความไม่พึงพอใจในงาน',null,null,2),
  ('resign_reason','สภาพแวดล้อมในการทำงาน',null,null,3),
  ('resign_reason','ผู้บังคับบัญชา',null,null,4),
  ('resign_reason','ความขัดแย้งในที่ทำงาน',null,null,5),
  ('resign_reason','ผลตอบแทนและสวัสดิการ',null,null,6),
  ('resign_reason','ความคาดหวังไม่ตรงกัน',null,null,7),
  ('resign_reason','เหตุผลส่วนตัว / ครอบครัว',null,null,8),
  ('course_category','อบรมภายนอก',null,null,1),('course_category','บุคคล',null,null,2),
  ('course_category','ไอที',null,null,3),('course_category','ระดับปฏิบัติการ',null,null,4),
  ('course_category','ระดับผู้บริหาร',null,null,5),('course_category','พนักงานใหม่',null,null,6),
  ('course_category','ระดับหัวหน้างาน',null,null,7),('course_category','บัญชี',null,null,8),
  ('skill_set','ธุรกิจ',null,null,1),('skill_set','ปฏิบัติการ',null,null,2),
  ('skill_set','การเงิน',null,null,3),('skill_set','เทคโนโลยี',null,null,4),
  ('title','นาย','Mr.',null,1),('title','นาง','Mrs.',null,2),('title','นางสาว','Miss',null,3),
  ('nationality','ไทย','Thai',null,1),('nationality','เมียนมา','Myanmar',null,2),
  ('nationality','ลาว','Lao',null,3),('nationality','กัมพูชา','Cambodian',null,4),
  ('nationality','อื่นๆ','Other',null,9),
  ('religion','พุทธ',null,null,1),('religion','อิสลาม',null,null,2),('religion','คริสต์',null,null,3),
  ('religion','ฮินดู',null,null,4),('religion','ไม่ระบุ',null,null,9),
  ('marital','โสด',null,null,1),('marital','สมรส',null,null,2),('marital','หย่าร้าง',null,null,3),('marital','หม้าย',null,null,4),
  ('military','ผ่านการเกณฑ์ทหารแล้ว',null,null,1),('military','ได้รับการยกเว้น',null,null,2),
  ('military','ยังไม่ผ่านการเกณฑ์ทหาร',null,null,3),('military','ไม่เกี่ยวข้อง',null,null,4),
  ('blood','A',null,null,1),('blood','B',null,null,2),('blood','AB',null,null,3),('blood','O',null,null,4),
  ('education_level','ต่ำกว่ามัธยม',null,null,1),('education_level','มัธยมศึกษาตอนต้น',null,null,2),
  ('education_level','มัธยมศึกษาตอนปลาย',null,null,3),('education_level','ปวช.',null,null,4),
  ('education_level','ปวส.',null,null,5),('education_level','ปริญญาตรี',null,null,6),
  ('education_level','ปริญญาโท',null,null,7),('education_level','ปริญญาเอก',null,null,8),
  ('relationship','บิดา',null,null,1),('relationship','มารดา',null,null,2),('relationship','คู่สมรส',null,null,3),
  ('relationship','บุตร',null,null,4),('relationship','พี่น้อง',null,null,5),('relationship','อื่นๆ',null,null,9),
  ('bank','ธนาคารกรุงเทพ','BBL',null,1),('bank','ธนาคารกสิกรไทย','KBANK',null,2),
  ('bank','ธนาคารกรุงไทย','KTB',null,3),('bank','ธนาคารไทยพาณิชย์','SCB',null,4),
  ('bank','ธนาคารกรุงศรีอยุธยา','BAY',null,5),('bank','ธนาคารทหารไทยธนชาต','TTB',null,6),
  ('bank','ธนาคารออมสิน','GSB',null,7),('bank','ธนาคารยูโอบี','UOB',null,8),
  ('bank','ธนาคารซีไอเอ็มบี ไทย','CIMBT',null,9),('bank','ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร','BAAC',null,10),
  ('asset_type','คอมพิวเตอร์โน้ตบุ๊ก',null,null,1),('asset_type','โทรศัพท์มือถือ',null,null,2),
  ('asset_type','บัตรพนักงาน',null,null,3),('asset_type','ยานพาหนะ',null,null,4)
) v(category, name, name_en, description, sort)
where not exists (select 1 from master_options);

-- ---------- Employment types ----------
insert into employment_types (code, name, name_en, pay_type, paid_traditional_holiday, calc, ot_rates) values
('MONTHLY','รายเดือน','Monthly','monthly',true,'{"ot":true,"late":true,"absent":true,"forgot":false,"early":true,"break_status":false,"flat_ot":false}','{"ot1":1,"ot2":1.5,"ot3":2,"ot4":3}'),
('DAILY','รายวัน','Daily','daily',true,'{"ot":true,"late":true,"absent":true,"forgot":false,"early":true,"break_status":false,"flat_ot":false}','{"ot1":1,"ot2":1.5,"ot3":2,"ot4":3}'),
('INTERN','ฝึกงาน','Internship','daily',false,'{"ot":false,"late":false,"absent":true,"forgot":false,"early":false,"break_status":false,"flat_ot":false}','{"ot1":1,"ot2":1.5,"ot3":2,"ot4":3}'),
('HOURLY','รายชั่วโมง','Hourly','hourly',false,'{"ot":true,"late":false,"absent":false,"forgot":false,"early":false,"break_status":false,"flat_ot":false}','{"ot1":1,"ot2":1.5,"ot3":2,"ot4":3}')
on conflict (code) do nothing;

-- ---------- Pay items ----------
insert into pay_items (kind, code, name, name_en, income_type, tax_mode, pay_when, in_sso, in_pf, in_ewf, in_ot, system_key, sort) values
('income','I01','เงินเดือน / ค่าจ้างรายวัน','Salary / Wage','40(1)','annual','every',true,true,true,true,'salary',1),
('income','I02','ค่าล่วงเวลา','Overtime','40(1)','once','month_end',true,false,true,false,'ot',2),
('income','I03','ค่าวิชาชีพ','Professional allowance','40(1)','annual','month_end',true,false,true,false,null,3),
('income','I04','โบนัส','Bonus','40(1)','once','every',false,false,false,false,'bonus',4),
('income','I05','ค่ากะ','Shift allowance','40(1)','annual','month_end',true,false,true,false,'shift_allowance',5),
('income','I06','ค่ากะพิเศษ (OT)','Special shift (OT)','40(1)','annual','month_end',false,false,false,false,null,6),
('income','I07','ค่ากะพิเศษ (วันหยุด)','Special shift (holiday)','40(1)','annual','month_end',false,false,false,false,null,7),
('income','I08','ค่ากะพิเศษจากเวลาทำงาน','Special shift (worked time)','40(1)','once','month_end',false,false,false,false,null,8),
('income','I09','เบี้ยขยัน','Diligence allowance','40(1)','once','month_end',true,false,true,false,'diligence',9),
('income','I10','เบี้ยขยันพิเศษ','Special diligence allowance','40(1)','once','month_end',false,false,false,false,null,10),
('income','I11','เงินสวัสดิการรักษาพยาบาล','Medical welfare','40(1)','annual','month_end',false,false,false,false,'welfare',11),
('income','I12','ค่าควบกะ','Double shift','40(1)','once','month_end',false,false,false,false,null,12),
('income','I13','คืนเงินวันลาคงเหลือ','Unused leave payout','40(1)','once','month_end',false,false,false,false,'leave_payout',13),
('income','I14','เงินชดเชย','Compensation','40(1)(2)','once','every',false,false,false,false,null,14),
('income','I15','ภาษีบริษัทออกให้','Company-paid tax','40(1)','once','every',false,false,false,false,'tax_company',15),
('income','I18','EJIP บริษัทสมทบ','EJIP employer','40(1)','annual','month_end',false,false,false,false,null,18),
('income','I19','รางวัล','Reward','40(1)','once','month_end',false,false,false,false,'reward',19),
('income','I20','เงินชดเชยเลิกจ้าง','Severance pay','40(1)(2)','once','every',false,false,false,false,'severance',20),
('income','I21','เงินได้อื่นๆ','Other income','40(1)','once','every',false,false,false,false,null,21),
('income','I22','ค่าใช้จ่ายเบิกคืน','Expense reimbursement',null,'none','every',false,false,false,false,'expense',22),
('income','I31','ตกเบิกปรับเงินเดือน','Back pay (salary)','40(1)','annual','month_end',true,false,true,false,null,31),
('income','I32','ตกเบิกค่าล่วงเวลา','Back pay (OT)','40(1)','once','month_end',true,false,true,false,null,32),
('income','I33','ตกเบิกขาดลามาสาย','Back pay (attendance)','40(1)','once','month_end',true,false,true,false,null,33),
('income','I34','ตกเบิกสวัสดิการ','Back pay (welfare)','40(1)','once','month_end',false,false,false,false,null,34),
('deduction','D01','ภาษีหัก ณ ที่จ่าย','Withholding tax',null,'none','month_end',false,false,false,false,'wht',1),
('deduction','D02','หักประกันสังคม','Social security',null,'none','every',false,false,false,false,'sso',2),
('deduction','D03','หักลาไม่รับค่าจ้าง','Unpaid leave','40(1)','once','every',true,true,true,false,'unpaid_leave',3),
('deduction','D04','หักไม่มาทำงาน','Absence','40(1)','once','month_end',true,true,true,false,'absence',4),
('deduction','D05','หักมาสาย/กลับก่อน','Late / early leave','40(1)','once','month_end',true,false,true,false,'late',5),
('deduction','D06','หักสวัสดิการ','Welfare deduction',null,'none','every',false,false,false,false,null,6),
('deduction','D08','หักพักงาน','Suspension','40(1)','once','every',true,true,true,false,null,8),
('deduction','D09','กองทุนสำรองเลี้ยงชีพ','Provident fund',null,'none','every',false,false,false,false,'pf',9),
('deduction','D11','กองทุนสงเคราะห์ลูกจ้าง','Employee welfare fund',null,'none','every',false,false,false,false,'ewf',11),
('deduction','D12','ค่าปรับ','Fines',null,'none','every',false,false,false,false,null,12),
('deduction','D13','ภาษีหัก 40(1) หัก 3%','WHT 3%',null,'none','month_end',false,false,false,false,null,13),
('deduction','D14','ภาษีเลิกจ้าง','Severance tax',null,'none','month_end',false,false,false,false,null,14),
('deduction','D15','ภาษีหัก 40(2) อยู่ในไทย','WHT 40(2)',null,'none','month_end',false,false,false,false,null,15),
('deduction','D16','ภาษี 40(5)','WHT 40(5)',null,'none','month_end',false,false,false,false,null,16),
('deduction','D16B','ภาษี 40(6)','WHT 40(6)',null,'none','month_end',false,false,false,false,null,17),
('deduction','D17','เงินกู้ กยศ.','Student loan (กยศ.)',null,'none','every',false,false,false,false,'student_loan',18),
('deduction','D18','เงินหักอื่นๆ','Other deduction',null,'none','every',false,false,false,false,null,19),
('deduction','D19','กรมบังคับคดี','Legal execution',null,'none','month_end',false,false,false,false,'legal_execution',20),
('deduction','D20','เงินหักวันลาเกินสิทธิ์','Excess leave','40(1)','once','month_end',true,true,true,false,'excess_leave',21),
('deduction','D21','ภาษีบริษัทออกให้','Company-paid tax',null,'none','every',false,false,false,false,'tax_company_ded',22),
('deduction','D47','เงินกู้ กรอ.','Student loan (กรอ.)',null,'none','every',false,false,false,false,'student_loan2',23),
('deduction','D001','เบิกเงินล่วงหน้า','Salary advance',null,'none','every',false,false,false,false,'advance',24),
('deduction','D002','ผ่อนชำระเงินกู้','Loan installment',null,'none','every',false,false,false,false,'loan',25)
on conflict (code, kind) do nothing;

-- ---------- Shifts ----------
insert into shifts (code, name, description, shift_type, start_time, end_time, break_start, break_end, ot_start, ot_end, weekdays, flexible, flex_minutes) values
('S1','สำนักงาน 08.00-17.00','พนักงานออฟฟิศ','morning','08:00','17:00','12:00','13:00','17:00','08:00','{1,2,3,4,5}',true,30),
('S2','กะเช้า 06.00-14.00','พนักงานกะเช้า','morning','06:00','14:00','10:00','10:30','14:00','06:00','{1,2,3,4,5,6}',false,0),
('S3','กะบ่าย 14.00-22.00','พนักงานกะบ่าย','afternoon','14:00','22:00','18:00','18:30','22:00','14:00','{1,2,3,4,5,6}',false,0),
('S4','กะดึก 22.00-06.00','พนักงานกะดึก','night','22:00','06:00','02:00','02:30','06:00','22:00','{1,2,3,4,5,6}',false,0)
on conflict (code) do nothing;

-- ---------- Work-in locations ----------
insert into work_locations (name, mode)
select * from (values
  ('ทำงานที่บ้าน (ขอเอกสารเท่านั้น)','wfh_doc'),
  ('ทำงานที่บ้าน (ขอเอกสารพร้อมลงเวลา)','wfh_both'),
  ('ทำงานที่บ้าน (ลงเวลาเท่านั้น)','wfh_clock')
) v(name, mode) where not exists (select 1 from work_locations);

-- ---------- Holiday calendar 2569 (2026) ----------
insert into holiday_calendars (name, is_default)
select 'ปฏิทินวันหยุดบริษัท', true where not exists (select 1 from holiday_calendars);

insert into holidays (calendar_id, holiday_date, name, name_en, kind)
select c.id, v.d::date, v.n, v.e, v.k from holiday_calendars c, (values
  ('2026-01-01','วันขึ้นปีใหม่','New Year Day','traditional'),
  ('2026-01-02','วันขึ้นปีใหม่ (พิเศษ)','New Year Day','traditional'),
  ('2026-01-03','วันขึ้นปีใหม่ (พิเศษ)','New Year Day (special)','traditional'),
  ('2026-03-06','วันมาฆบูชา','Makha Bucha Day','traditional'),
  ('2026-04-06','วันจักรี','Chakri Memorial Day','traditional'),
  ('2026-04-13','วันสงกรานต์','Songkran Festival Day','traditional'),
  ('2026-04-14','วันสงกรานต์ (ต่อเนื่อง #1)','Songkran Festival (Special)','traditional'),
  ('2026-04-15','วันสงกรานต์ (ต่อเนื่อง #2)','Songkran Festival Day (continuous)','company'),
  ('2026-04-17','วันสงกรานต์ (ต่อเนื่อง #4)','Songkran Festival Day (continuous)','company'),
  ('2026-05-01','วันแรงงานแห่งชาติ','National Labour Day','traditional'),
  ('2026-05-04','วันฉัตรมงคล','Coronation Day','company'),
  ('2026-06-03','วันวิสาขบูชา','Visakha Bucha Day','traditional'),
  ('2026-06-03','วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี','Queen Suthida''s Birthday','company'),
  ('2026-07-28','วันเฉลิมพระชนมพรรษา ร.10','H.M. The King''s Birthday','traditional'),
  ('2026-08-01','วันอาสาฬหบูชา','Asanha Bucha Day','traditional'),
  ('2026-08-02','วันเข้าพรรษา','Buddhist Lent','traditional'),
  ('2026-10-13','วันคล้ายวันสวรรคต ร.9','King Bhumibol Memorial Day','traditional'),
  ('2026-10-23','วันปิยมหาราช','Chulalongkorn Memorial Day','company'),
  ('2026-12-05','วันพ่อแห่งชาติ','Father''s Day','company'),
  ('2026-12-10','วันรัฐธรรมนูญ','Constitution Day','traditional'),
  ('2026-12-11','ชดเชยวันรัฐธรรมนูญ','Substitution for Constitution Day','traditional'),
  ('2026-12-31','วันสิ้นปี','End Year Day','company')
) v(d, n, e, k)
where c.is_default
on conflict do nothing;

-- ---------- Leave / time document types ----------
insert into leave_types (category, base_kind, code, name, name_en, rules, quota, sort)
select * from (values
  ('leave','personal','L01','ลากิจ','Personal leave',
   '{"min_minutes":60,"allow_advance":true,"allow_backdate":true,"min_half_day":false,"gender":"all","after_probation":false,"attach":false,"paid":true,"count_holidays":false,"diligence_keep":false,"carry_over":0}'::jsonb,
   '{"unit":"day","by":"all","days":3,"prorate":false}'::jsonb, 1),
  ('leave','vacation','L02','ลาพักร้อน','Annual leave',
   '{"min_minutes":240,"allow_advance":true,"allow_backdate":true,"min_half_day":true,"gender":"all","after_probation":true,"attach":false,"paid":true,"count_holidays":false,"diligence_keep":true,"carry_over":6}',
   '{"unit":"day","by":"tenure","days":6,"tenure":[[1,6],[3,8],[5,10]],"prorate":true}', 2),
  ('leave','sick','L03','ลาป่วย','Sick leave',
   '{"min_minutes":60,"allow_advance":false,"allow_backdate":true,"min_half_day":false,"gender":"all","after_probation":false,"attach":false,"attach_after_days":3,"paid":true,"count_holidays":false,"diligence_keep":false,"carry_over":0}',
   '{"unit":"day","by":"all","days":30,"prorate":false}', 3),
  ('leave','maternity','L04','ลาคลอด','Maternity leave',
   '{"min_minutes":480,"allow_advance":true,"allow_backdate":true,"gender":"female","attach":true,"paid":true,"paid_days":45,"count_holidays":true,"diligence_keep":true}',
   '{"unit":"day","by":"all","days":120,"prorate":false}', 4),
  ('leave','unpaid_personal','L05','ลากิจไม่รับค่าจ้าง','Unpaid personal leave',
   '{"min_minutes":60,"allow_advance":true,"allow_backdate":true,"gender":"all","paid":false,"diligence_keep":false}',
   '{"unit":"unlimited"}', 5),
  ('leave','unpaid_sick','L06','ลาป่วยไม่รับค่าจ้าง','Unpaid sick leave',
   '{"min_minutes":60,"allow_advance":false,"allow_backdate":true,"gender":"all","paid":false,"diligence_keep":false}',
   '{"unit":"unlimited"}', 6),
  ('leave','unpaid_maternity','L07','ลาคลอดไม่รับค่าจ้าง','Unpaid maternity leave',
   '{"min_minutes":480,"gender":"female","paid":false,"count_holidays":true,"diligence_keep":true}',
   '{"unit":"unlimited"}', 7),
  ('leave','child_sick','L08','ลาเพื่อดูแลบุตรป่วย','Sick child care leave',
   '{"min_minutes":240,"allow_backdate":true,"gender":"all","paid":false}',
   '{"unit":"day","by":"all","days":15}', 8),
  ('leave','child_care','L09','ลาเลี้ยงดูบุตร','Child care leave',
   '{"min_minutes":480,"gender":"all","paid":false,"count_holidays":true}',
   '{"unit":"day","by":"all","days":15}', 9),
  ('leave','training','L10','ลาฝึกอบรม','Training leave',
   '{"min_minutes":240,"allow_advance":true,"paid":false,"attach":true}',
   '{"unit":"day","by":"all","days":30}', 10),
  ('leave','military','L11','ลาฝึกวิชาทหาร','Military training leave',
   '{"min_minutes":480,"gender":"male","paid":true,"attach":true,"count_holidays":true,"diligence_keep":true}',
   '{"unit":"day","by":"all","days":60}', 11),
  ('leave','ordination','L12','ลาบวช','Ordination leave',
   '{"min_minutes":480,"gender":"male","paid":true,"once":true,"after_probation":true,"count_holidays":true,"diligence_keep":true}',
   '{"unit":"day","by":"all","days":15}', 12),
  ('leave','sterilization','L13','ลาทำหมัน','Sterilisation leave',
   '{"min_minutes":480,"paid":true,"attach":true,"diligence_keep":true}',
   '{"unit":"unlimited"}', 13),
  ('offsite','customer','F01','เข้าพบลูกค้า','Customer visit','{"min_minutes":30,"allow_advance":true,"allow_backdate":true,"allow_checkin":true}','{}', 20),
  ('offsite','training','F02','ฝึกอบรมและสัมมนา','Training & seminar','{"min_minutes":30,"allow_advance":true,"allow_backdate":true,"allow_checkin":true}','{}', 21),
  ('offsite','government','F03','ติดต่อราชการ','Government contact','{"min_minutes":30,"allow_advance":true,"allow_backdate":true}','{}', 22),
  ('offsite','branch','F04','ปฏิบัติงานที่สาขา','Work at branch','{"min_minutes":30,"allow_advance":true,"allow_backdate":true,"allow_checkin":true}','{}', 23),
  ('offsite','field','F05','งานภาคสนาม','Field work','{"min_minutes":30,"allow_advance":true,"allow_backdate":true,"allow_checkin":true}','{}', 24),
  ('offsite','activity','F06','กิจกรรมบริษัท','Company activity','{"min_minutes":30,"allow_advance":true,"allow_backdate":true}','{}', 25),
  ('offsite','wfh','F07','ทำงานที่บ้าน','Work from home','{"min_minutes":30,"allow_advance":true,"allow_backdate":true,"allow_checkin":true}','{}', 26),
  ('offsite','other','F99','อื่นๆ','Other','{"min_minutes":30,"allow_advance":true,"allow_backdate":true}','{}', 27),
  ('certify','certify','C01','รับรองเวลา','Time certification','{"allow_backdate":true,"backdate_days":30,"allow_on_holiday":false,"diligence_keep":false}','{}', 30),
  ('swap','swap','W01','แลกเวลา','Time swap','{"min_minutes":30,"min_balance_minutes":0,"allow_advance":true,"allow_backdate":true,"use_within_days":90}','{}', 31),
  ('accumulate','accumulate','A01','ขอสะสมเวลา','Time accumulation','{"min_minutes":30,"allow_advance":true,"allow_backdate":true,"holiday_only":false,"use_within_days":90}','{}', 32)
) v(category, base_kind, code, name, name_en, rules, quota, sort)
where not exists (select 1 from leave_types);

-- ---------- Default approval workflows ----------
insert into workflows (doc_type, steps) values
('leave','[{"mode":"chain_all"}]'),('offsite','[{"mode":"chain_all"}]'),('certify','[{"mode":"chain_all"}]'),
('ot','[{"mode":"chain_all"}]'),('accumulate','[{"mode":"chain_all"}]'),('swap','[{"mode":"chain_all"}]'),
('doc','[{"mode":"role","role_code":"HR_STAFF"}]'),('change_shift','[{"mode":"direct"}]'),('swap_shift','[{"mode":"direct"}]'),
('warning','[{"mode":"role","role_code":"HR_MANAGER"}]'),('action','[{"mode":"role","role_code":"HR_MANAGER"}]'),
('welfare','[{"mode":"direct"},{"mode":"role","role_code":"HR_STAFF"}]'),('expense','[{"mode":"direct"},{"mode":"role","role_code":"ACCOUNTANT"}]')
on conflict do nothing;

-- ---------- Roles ----------
insert into roles (code, name, description, is_hr, auto, permissions, payroll_perms) values
('ADMIN','Administrator','สิทธิ์เต็มในการจัดการทั้งระบบ',true,null,'{"*":["view","create","edit","delete"]}','["calculate","review","approve","close","pay","adjust","reverse","delete_special"]'),
('HR_MANAGER','HR Manager','ดูแลเงินเดือนประจำเดือน และอนุมัติเอกสารการลา',true,null,
 '{"employees":["view","create","edit","delete"],"employees.personal":["view","edit"],"employees.salary":["view","edit"],"employees.export":["view"],"team":["view","create","edit"],"team.actions":["view","create","edit"],"documents.onbehalf":["view","create","edit"],"org":["view","create","edit","delete"],"payroll":["view","create","edit"],"reports":["view"],"dashboard":["view"],"announcements":["view","create","edit","delete"],"settings.org":["view","edit"],"settings.time":["view","create","edit","delete"],"settings.payroll":["view","create","edit"],"learn.manage":["view","create","edit"],"audit":["view"]}',
 '["calculate","review","approve","close","pay","adjust"]'),
('HR_PAYROLL','HR Payroll','รับผิดชอบงานเงินเดือน',true,null,
 '{"employees":["view"],"employees.salary":["view","edit"],"payroll":["view","create","edit"],"reports":["view"],"settings.payroll":["view","create","edit"]}',
 '["calculate","review","adjust"]'),
('HR_STAFF','HR Staff','ดูแลข้อมูลพนักงานและอนุมัติเอกสารตามที่ได้รับมอบหมาย',true,null,
 '{"employees":["view","create","edit"],"employees.personal":["view","edit"],"employees.export":["view"],"team":["view","create"],"team.actions":["view","create"],"documents.onbehalf":["view","create"],"org":["view"],"reports":["view"],"dashboard":["view"],"announcements":["view","create","edit"],"settings.time":["view","create","edit"]}',
 '[]'),
('ACCOUNTANT','Accountant','จัดการและทำจ่ายตามแผนการใช้งาน',false,null,
 '{"payroll":["view"],"reports":["view"]}','["pay"]'),
('IT','IT','จัดการสิทธิ์การเข้าใช้งานและการตั้งค่าระบบ',false,null,
 '{"settings.system":["view","create","edit","delete"],"audit":["view"]}','[]'),
('LEARN_MANAGER','Learn Manager','จัดการคอร์สเรียนและการอบรม',false,null,'{"learn.manage":["view","create","edit","delete"]}','[]'),
('ASSET_ADMIN','Asset Admin','จัดการทรัพย์สินของบริษัท',false,null,'{"employees":["view"]}','[]'),
('HRD','HRD Specialist','จัดการการประเมินพนักงาน',false,null,'{"employees":["view"],"reports":["view"]}','[]'),
('REWARD_MANAGER','Reward Manager','จัดการรางวัลและการชื่นชม',false,null,'{"employees":["view"]}','[]'),
('TALENT','Talent Acquisition','จัดการการสรรหาและประกาศรับสมัคร',false,null,'{"employees":["view","create"]}','[]'),
('STAFF','Staff','จัดการข้อมูลตนเอง ยื่นใบลาและเอกสารต่างๆ',false,'everyone','{"home":["view"],"documents":["view","create","edit","delete"],"learn":["view"]}','[]'),
('SUPERVISOR','Supervisor','กำหนดให้หัวหน้าทุกคนโดยอัตโนมัติ มีสิทธิ์ตรวจสอบและอนุมัติเอกสาร',false,'supervisor','{"team":["view","create"],"documents.onbehalf":["view","create"]}','[]')
on conflict (code) do nothing;

-- ---------- Welfare examples ----------
insert into welfare_types (name, description, budget_per_year, pay_item_id, after_probation)
select 'ค่ารักษาพยาบาล', 'เบิกค่ารักษาพยาบาลตามใบเสร็จ', 10000, (select id from pay_items where code = 'I11' and kind = 'income'), true
where not exists (select 1 from welfare_types);
