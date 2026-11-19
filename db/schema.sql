-- =====================================================================
-- Mine Works HR — database schema (PostgreSQL 14+)
-- Feature scope modelled on empeo: multi-company, org structure, employee
-- records, time & attendance, leave, requests with approval workflows,
-- personnel actions, payroll (Thai PIT / SSO / PF / EWF), reports.
-- Run once on an empty database, then run db/seed.sql.
-- =====================================================================

create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id serial primary key,
  name text not null,
  mime text not null default 'application/octet-stream',
  size integer not null default 0,
  data bytea not null,
  created_by integer,
  created_at timestamptz not null default now()
);

-- ---------------- Organisation ----------------

create table if not exists companies (
  id serial primary key,
  code text not null unique,
  name_th text not null,
  name_en text,
  tax_id text,
  phone text,
  country text not null default 'ไทย',
  address_th text,
  address_en text,
  province text,
  district text,
  subdistrict text,
  postcode text,
  sso_employer_no text,
  payroll_bank_mode text not null default 'single_single'
    check (payroll_bank_mode in ('single_single','single_multi','multi_single','multi_multi','none')),
  bank_name text,
  bank_account text,
  -- work conditions, OT rules, document & payslip settings (see lib/defaults.ts)
  conditions jsonb not null default '{}'::jsonb,
  ot_rules jsonb not null default '{}'::jsonb,
  doc_settings jsonb not null default '{}'::jsonb,
  slip_settings jsonb not null default '{}'::jsonb,
  logo_file_id integer references files(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id serial primary key,
  company_id integer not null references companies(id),
  code text not null,
  name text not null,
  province text,
  sso_submit boolean not null default true,
  sso_branch_no text,
  active boolean not null default true,
  unique (company_id, code)
);

create table if not exists position_levels (
  id serial primary key,
  code text not null unique,
  name text not null,
  name_en text,
  description text,
  rank integer not null default 100 -- smaller = more senior
);

create table if not exists positions (
  id serial primary key,
  name text not null,
  name_en text,
  level_id integer references position_levels(id),
  company_id integer references companies(id), -- null = every company
  headcount_plan integer,
  description text,
  active boolean not null default true
);

create table if not exists org_units (
  id serial primary key,
  company_id integer not null references companies(id),
  parent_id integer references org_units(id),
  kind text not null default 'department' check (kind in ('division','department','section','unit')),
  code text,
  name text not null,
  name_en text,
  cost_center text,
  head_employee_id integer,
  active boolean not null default true,
  sort integer not null default 0
);

-- Generic option lists ("มาสเตอร์"): occupation, employee_type, company_rule,
-- asset_type, attachment_type, ot_reason, separation_reason, resign_reason,
-- reject_reason, course_category, skill_set, achievement_category, title,
-- nationality, religion, marital, military, blood, education_level,
-- relationship, bank, work_location ...
create table if not exists master_options (
  id serial primary key,
  category text not null,
  name text not null,
  name_en text,
  description text,
  extra jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  active boolean not null default true,
  updated_by integer,
  updated_at timestamptz not null default now()
);
create index if not exists master_options_cat_idx on master_options (category, sort);

-- ---------------- Time setup ----------------

create table if not exists shifts (
  id serial primary key,
  code text not null unique,
  name text not null,
  company_id integer references companies(id),
  timezone text not null default 'Asia/Bangkok',
  description text,
  shift_type text not null default 'morning' check (shift_type in ('morning','afternoon','night','flex')),
  color text,
  allow_ot boolean not null default true,
  holiday_ot_basis text not null default 'previous_shift',
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  ot_start time,
  ot_end time,
  weekdays integer[] not null default '{1,2,3,4,5}', -- 0 = Sunday
  flexible boolean not null default false,
  flex_minutes integer not null default 0,
  pre_ot_minutes integer not null default 0,
  auto_ot boolean not null default false,
  auto_ot_min_minutes integer not null default 60,
  allowance numeric(10,2) not null default 0,
  break_status boolean not null default false,
  active boolean not null default true,
  updated_by integer,
  updated_at timestamptz not null default now()
);

create table if not exists work_locations (
  id serial primary key,
  name text not null,
  company_id integer references companies(id),
  mode text not null default 'gps' check (mode in ('gps','anywhere','wfh_doc','wfh_clock','wfh_both')),
  lat double precision,
  lng double precision,
  radius_m integer not null default 200,
  active boolean not null default true
);

create table if not exists holiday_calendars (
  id serial primary key,
  name text not null,
  company_id integer references companies(id),
  is_default boolean not null default false,
  active boolean not null default true
);

create table if not exists holidays (
  id serial primary key,
  calendar_id integer not null references holiday_calendars(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  name_en text,
  kind text not null default 'traditional' check (kind in ('traditional','company')),
  active boolean not null default true,
  unique (calendar_id, holiday_date, name)
);

-- category: leave | offsite | certify | swap | accumulate
create table if not exists leave_types (
  id serial primary key,
  company_id integer references companies(id),
  category text not null default 'leave' check (category in ('leave','offsite','certify','swap','accumulate')),
  base_kind text not null default 'other',
  code text,
  name text not null,
  name_en text,
  description text,
  rules jsonb not null default '{}'::jsonb,
  quota jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  active boolean not null default true,
  updated_by integer,
  updated_at timestamptz not null default now()
);

-- ---------------- Payroll setup ----------------

create table if not exists employment_types (
  id serial primary key,
  code text not null unique,
  name text not null,
  name_en text,
  pay_type text not null default 'monthly' check (pay_type in ('monthly','daily','hourly')),
  paid_traditional_holiday boolean not null default true,
  calc jsonb not null default '{}'::jsonb,      -- {ot,late,absent,forgot,early,break_status,flat_ot}
  ot_rates jsonb not null default '{"ot1":1,"ot2":1.5,"ot3":2,"ot4":3}'::jsonb,
  active boolean not null default true
);

create table if not exists pay_items (
  id serial primary key,
  company_id integer references companies(id),
  kind text not null check (kind in ('income','deduction')),
  code text not null,
  name text not null,
  name_en text,
  income_type text,                 -- 40(1), 40(2), 40(1)(2) ...
  tax_mode text not null default 'none' check (tax_mode in ('annual','once','none')),
  pay_when text not null default 'every' check (pay_when in ('every','month_end')),
  rounding text not null default 'none' check (rounding in ('none','round','up','down')),
  in_sso boolean not null default false,
  in_pf boolean not null default false,
  in_ewf boolean not null default false,
  in_ot boolean not null default false,
  system_key text,                  -- engine hook, e.g. salary, ot, sso, wht ...
  account_code text,
  sort integer not null default 0,
  active boolean not null default true,
  unique (code, kind)
);

create table if not exists payroll_cycles (
  id serial primary key,
  company_id integer not null references companies(id),
  employment_type_id integer not null references employment_types(id),
  frequency text not null default 'monthly' check (frequency in ('monthly','semi','tri','weekly')),
  first_start_date date not null,
  first_period_date date,
  pay_rule text not null default 'last_day' check (pay_rule in ('last_day','same_month','next_month')),
  pay_day integer,
  off_period_from integer,          -- day of month attendance/OT closes (null = same as period)
  active boolean not null default true,
  unique (company_id, employment_type_id)
);

-- ---------------- Security ----------------

create table if not exists roles (
  id serial primary key,
  code text not null unique,
  name text not null,
  description text,
  is_hr boolean not null default false,
  auto text check (auto in ('everyone','supervisor')),
  permissions jsonb not null default '{}'::jsonb,   -- { "<feature>": ["view","create","edit","delete"] } or {"*":[...]}
  payroll_perms jsonb not null default '[]'::jsonb, -- ["calculate","review","approve","close","pay","adjust","reverse","delete_special"]
  active boolean not null default true
);

-- ---------------- Employees ----------------

create table if not exists employees (
  id serial primary key,
  code text not null unique,
  company_id integer references companies(id),
  branch_id integer references branches(id),
  org_unit_id integer references org_units(id),
  position_id integer references positions(id),
  supervisor_id integer references employees(id),
  shift_id integer references shifts(id),
  calendar_id integer references holiday_calendars(id),
  employment_type_id integer references employment_types(id),
  employee_type_id integer references master_options(id),
  status text not null default 'probation' check (status in ('pending','probation','confirmed','terminated')),
  start_date date,
  probation_end_date date,
  confirm_date date,
  contract_end_date date,
  end_date date,
  separation_reason_id integer references master_options(id),
  separation_note text,
  clock_required boolean not null default true,
  driver_license text,
  work_location text,

  person_type text not null default 'thai' check (person_type in ('thai','foreign')),
  title text,
  first_name text not null,
  last_name text not null,
  first_name_en text,
  last_name_en text,
  nickname text,
  nickname_en text,
  birth_date date,
  gender text check (gender in ('male','female','other')),
  national_id text,
  passport_no text,
  work_permit_no text,
  work_permit_expiry date,
  race text,
  nationality text,
  religion text,
  marital_status text,
  military_status text,
  blood_type text,
  weight numeric(5,1),
  height numeric(5,1),
  note text,
  photo_file_id integer references files(id),

  work_email text,
  work_phone text,
  personal_email text,
  mobile text,
  line_id text,
  address_registered text,
  address_current text,

  payment_method text not null default 'bank' check (payment_method in ('bank','cash')),
  bank_name text,
  bank_account text,
  salary numeric(12,2) not null default 0,       -- monthly salary, or daily/hourly rate
  tax_method text not null default 'withhold' check (tax_method in ('withhold','company_once','company_always','none')),
  sso_enabled boolean not null default true,
  wcf_enabled boolean not null default true,
  sso_id text,
  sso_hospital text,
  sso_card_date date,
  sso_doc text,
  sso_end_reason text,
  pf_enabled boolean not null default false,
  pf_employee_rate numeric(5,2) not null default 0,
  pf_employer_rate numeric(5,2) not null default 0,
  pf_join_date date,
  ewf_enabled boolean not null default true,
  diligence_enabled boolean not null default false,

  password_hash text,
  login_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists employees_email_uq on employees (lower(work_email)) where work_email is not null;
create index if not exists employees_supervisor_idx on employees (supervisor_id);

alter table org_units drop constraint if exists org_units_head_fk;
alter table org_units add constraint org_units_head_fk foreign key (head_employee_id) references employees(id);

create table if not exists user_roles (
  employee_id integer not null references employees(id) on delete cascade,
  role_id integer not null references roles(id) on delete cascade,
  primary key (employee_id, role_id)
);

create table if not exists user_groups (
  id serial primary key,
  name text not null,
  description text,
  active boolean not null default true
);
create table if not exists user_group_members (
  group_id integer not null references user_groups(id) on delete cascade,
  employee_id integer not null references employees(id) on delete cascade,
  primary key (group_id, employee_id)
);

create table if not exists employee_locations (
  employee_id integer not null references employees(id) on delete cascade,
  location_id integer not null references work_locations(id) on delete cascade,
  primary key (employee_id, location_id)
);

create table if not exists emergency_contacts (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  name text not null,
  relationship text,
  phone text
);

create table if not exists employee_experiences (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  company text not null,
  position text not null,
  last_salary numeric(12,2),
  date_from date,
  date_to date,
  responsibilities text
);

create table if not exists employee_educations (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  institution text not null,
  level text not null,
  country text,
  faculty text,
  major text,
  year_from integer,
  year_to integer,
  gpa numeric(4,2)
);

create table if not exists employee_families (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  name text not null,
  relationship text not null,
  birth_date date,
  occupation text,
  phone text
);

create table if not exists employee_attachments (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  type_id integer references master_options(id),
  name text not null,
  file_id integer references files(id),
  expires_on date,
  uploaded_by integer references employees(id),
  created_at timestamptz not null default now()
);

create table if not exists salary_history (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  kind text not null default 'salary' check (kind in ('salary','bonus')),
  effective_date date not null,
  action text not null,
  amount_before numeric(12,2),
  amount_after numeric(12,2),
  note text,
  created_by integer references employees(id),
  created_at timestamptz not null default now()
);

-- Recurring income / deduction per employee
create table if not exists employee_pay_items (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  pay_item_id integer not null references pay_items(id),
  amount numeric(12,2) not null,
  start_date date,
  end_date date,
  note text
);

-- Loans, salary advances, legal execution (กรมบังคับคดี), student loans (กยศ./กรอ.)
create table if not exists liabilities (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  kind text not null check (kind in ('loan','advance','legal_execution','student_loan','other')),
  pay_item_id integer references pay_items(id),
  reference text,
  total numeric(12,2),
  installment numeric(12,2) not null,
  start_date date not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

-- Personal income tax allowances (ลดหย่อน) per tax year
create table if not exists tax_allowances (
  employee_id integer not null references employees(id) on delete cascade,
  year integer not null,
  data jsonb not null default '{}'::jsonb,
  primary key (employee_id, year)
);

-- Opening balances when starting mid-year (เงินสะสมประจำปี)
create table if not exists ytd_openings (
  employee_id integer not null references employees(id) on delete cascade,
  year integer not null,
  income numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  sso numeric(12,2) not null default 0,
  pf numeric(12,2) not null default 0,
  primary key (employee_id, year)
);

-- ---------------- Attendance ----------------

create table if not exists clock_records (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  ts timestamptz not null,
  source text not null default 'web' check (source in ('web','mobile','device','import','manual','certify')),
  lat double precision,
  lng double precision,
  distance_m integer,
  location_id integer references work_locations(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists clock_records_emp_ts_idx on clock_records (employee_id, ts);

create table if not exists shift_assignments (
  employee_id integer not null references employees(id) on delete cascade,
  work_date date not null,
  shift_id integer references shifts(id), -- null = day off
  primary key (employee_id, work_date)
);

create table if not exists daily_reports (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  report_date date not null,
  mood integer,
  body text,
  created_at timestamptz not null default now(),
  unique (employee_id, report_date)
);

create table if not exists leave_quota_overrides (
  employee_id integer not null references employees(id) on delete cascade,
  leave_type_id integer not null references leave_types(id) on delete cascade,
  year integer not null,
  days numeric(6,2) not null,
  note text,
  primary key (employee_id, leave_type_id, year)
);

-- ---------------- Requests & approvals ----------------

-- doc_type: leave | offsite | swap | certify | ot | accumulate | doc | change_shift
--           | swap_shift | warning | action | welfare | expense
create table if not exists workflows (
  id serial primary key,
  doc_type text not null,
  sub_type_id integer,               -- e.g. leave_types.id, null = main workflow
  company_id integer references companies(id),
  steps jsonb not null default '[{"mode":"chain_all"}]'::jsonb,
  updated_by integer,
  updated_at timestamptz not null default now(),
  unique (doc_type, sub_type_id, company_id)
);

create table if not exists requests (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  doc_type text not null,
  sub_type_id integer,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  full_day boolean not null default true,
  minutes integer not null default 0,
  days numeric(6,2) not null default 0,
  amount numeric(12,2),
  reason_id integer references master_options(id),
  detail text,
  payload jsonb not null default '{}'::jsonb,
  file_id integer references files(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_by integer references employees(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  applied_at timestamptz
);
create index if not exists requests_emp_idx on requests (employee_id, doc_type, status);
create index if not exists requests_dates_idx on requests (start_date, end_date);

create table if not exists request_steps (
  id serial primary key,
  request_id integer not null references requests(id) on delete cascade,
  seq integer not null,
  approver_id integer references employees(id),
  role_id integer references roles(id),
  status text not null default 'waiting' check (status in ('waiting','pending','approved','rejected','skipped')),
  comment text,
  decided_by integer references employees(id),
  decided_at timestamptz
);
create index if not exists request_steps_req_idx on request_steps (request_id, seq);
create index if not exists request_steps_appr_idx on request_steps (approver_id, status);

-- ---------------- Welfare ----------------

create table if not exists welfare_types (
  id serial primary key,
  name text not null,
  description text,
  budget_per_year numeric(12,2),
  pay_item_id integer references pay_items(id),
  after_probation boolean not null default false,
  active boolean not null default true
);

-- ---------------- Payroll runs ----------------

create table if not exists payroll_periods (
  id serial primary key,
  cycle_id integer references payroll_cycles(id),
  company_id integer not null references companies(id),
  employment_type_id integer references employment_types(id),
  name text not null,
  year integer not null,
  month integer not null,
  seq integer not null default 1,
  start_date date not null,
  end_date date not null,
  att_start date not null,
  att_end date not null,
  pay_date date not null,
  is_special boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft','calculated','reviewed','approved','closed','paid')),
  calculated_at timestamptz,
  reviewed_by integer references employees(id),
  approved_by integer references employees(id),
  closed_by integer references employees(id),
  paid_by integer references employees(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists payroll_manual_items (
  id serial primary key,
  period_id integer not null references payroll_periods(id) on delete cascade,
  employee_id integer not null references employees(id) on delete cascade,
  pay_item_id integer not null references pay_items(id),
  amount numeric(12,2) not null,
  note text,
  created_by integer references employees(id)
);

create table if not exists payroll_lines (
  id serial primary key,
  period_id integer not null references payroll_periods(id) on delete cascade,
  employee_id integer not null references employees(id) on delete cascade,
  gross numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  taxable numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  sso_employee numeric(12,2) not null default 0,
  sso_employer numeric(12,2) not null default 0,
  sso_base numeric(12,2) not null default 0,
  pf_employee numeric(12,2) not null default 0,
  pf_employer numeric(12,2) not null default 0,
  ewf_employee numeric(12,2) not null default 0,
  ewf_employer numeric(12,2) not null default 0,
  detail jsonb not null default '{}'::jsonb,
  unique (period_id, employee_id)
);

create table if not exists payroll_line_items (
  id serial primary key,
  line_id integer not null references payroll_lines(id) on delete cascade,
  pay_item_id integer not null references pay_items(id),
  amount numeric(12,2) not null,
  qty numeric(10,2),
  source text not null default 'auto',
  note text
);
create index if not exists payroll_line_items_line_idx on payroll_line_items (line_id);

-- ---------------- Communication ----------------

create table if not exists announcements (
  id serial primary key,
  kind text not null default 'news' check (kind in ('news','policy')),
  title text not null,
  body text,
  company_id integer references companies(id),
  publish_at date not null default current_date,
  pinned boolean not null default false,
  active boolean not null default true,
  created_by integer references employees(id),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id serial primary key,
  employee_id integer not null references employees(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_emp_idx on notifications (employee_id, read_at);

create table if not exists audit_logs (
  id serial primary key,
  actor_id integer references employees(id),
  action text not null,
  entity text not null,
  entity_id integer,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------- Learn ----------------

create table if not exists courses (
  id serial primary key,
  title text not null,
  category_id integer references master_options(id),
  description text,
  url text,
  duration_minutes integer,
  company_id integer references companies(id),
  published boolean not null default false,
  created_by integer references employees(id),
  created_at timestamptz not null default now()
);

create table if not exists course_enrollments (
  course_id integer not null references courses(id) on delete cascade,
  employee_id integer not null references employees(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  score numeric(5,2),
  completed_at timestamptz,
  primary key (course_id, employee_id)
);
