-- HR app schema (PostgreSQL)

create table if not exists branches (
  id serial primary key,
  name text not null unique,
  lat double precision,
  lng double precision,
  radius_m integer
);

create table if not exists departments (
  id serial primary key,
  name text not null unique
);

create table if not exists positions (
  id serial primary key,
  name text not null unique
);

create table if not exists shifts (
  id serial primary key,
  name text not null unique,
  start_time time not null,
  end_time time not null,
  grace_min integer not null default 0
);

create table if not exists employees (
  id serial primary key,
  code text not null unique,
  email text not null unique,
  password_hash text not null,
  role text not null default 'employee' check (role in ('admin','hr','manager','employee')),
  first_name text not null,
  last_name text not null,
  nickname text,
  phone text,
  department_id integer references departments(id),
  position_id integer references positions(id),
  branch_id integer references branches(id),
  shift_id integer references shifts(id),
  manager_id integer references employees(id),
  employment_type text not null default 'fulltime' check (employment_type in ('fulltime','probation','contract','parttime')),
  start_date date,
  end_date date,
  birth_date date,
  status text not null default 'active' check (status in ('active','resigned')),
  base_salary numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id serial primary key,
  employee_id integer not null references employees(id),
  work_date date not null,
  check_in timestamptz not null,
  check_out timestamptz,
  in_lat double precision,
  in_lng double precision,
  in_distance_m integer,
  out_lat double precision,
  out_lng double precision,
  out_distance_m integer,
  late_minutes integer not null default 0,
  unique (employee_id, work_date)
);

create table if not exists leave_types (
  id serial primary key,
  name text not null unique,
  days_per_year numeric(5,1) not null,
  paid boolean not null default true
);

create table if not exists leave_requests (
  id serial primary key,
  employee_id integer not null references employees(id),
  leave_type_id integer not null references leave_types(id),
  start_date date not null,
  end_date date not null,
  days numeric(5,1) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id integer references employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ot_requests (
  id serial primary key,
  employee_id integer not null references employees(id),
  work_date date not null,
  hours numeric(4,1) not null check (hours > 0 and hours <= 24),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id integer references employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists holidays (
  id serial primary key,
  holiday_date date not null unique,
  name text not null
);

create index if not exists attendance_date_idx on attendance (work_date);
create index if not exists leave_requests_emp_idx on leave_requests (employee_id, status);
create index if not exists ot_requests_emp_idx on ot_requests (employee_id, status);

-- Starter data
insert into branches (name) values ('สำนักงานใหญ่') on conflict do nothing;
insert into shifts (name, start_time, end_time, grace_min) values ('กะปกติ', '09:00', '18:00', 0) on conflict do nothing;
insert into leave_types (name, days_per_year, paid) values
  ('ลาป่วย', 30, true),
  ('ลากิจ', 3, true),
  ('ลาพักร้อน', 6, true)
on conflict do nothing;
