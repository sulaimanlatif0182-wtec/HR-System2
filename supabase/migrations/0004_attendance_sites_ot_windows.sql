-- 0004_attendance_sites_ot_windows.sql
-- Shared rate-limit store + DB-driven attendance geofence sites and OT windows.
-- Previously the sites and OT windows were hardcoded in api/attendance.js;
-- this makes them admin-configurable without redeploys.
-- Idempotent: can be run multiple times safely.

-- ============================================================
-- 1. Rate limiting store (lib/rateLimit.js remote backing)
-- ============================================================
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 1,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. Attendance geofence sites
-- ============================================================
create table if not exists attendance_sites (
  id bigint generated always as identity primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters numeric not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into attendance_sites (name, latitude, longitude, radius_meters)
select 'Factory 1', 2.9662584, 101.8372782, 100
where not exists (select 1 from attendance_sites);

insert into attendance_sites (name, latitude, longitude, radius_meters)
select 'Factory 2', 2.967353, 101.836689, 100
where not exists (select 1 from attendance_sites);

-- ============================================================
-- 3. Overtime check-out windows (30-minute blocks)
-- ============================================================
create table if not exists ot_windows (
  id bigint generated always as identity primary key,
  start_minutes integer not null,
  end_minutes integer not null,
  overtime_hours numeric not null,
  label text,
  created_at timestamptz not null default now(),
  unique (start_minutes, end_minutes)
);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 17 * 60 + 46, 18 * 60 + 15, 0.5, 'OT 0.5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 18 * 60 + 16, 18 * 60 + 45, 1, 'OT 1h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 18 * 60 + 46, 19 * 60 + 15, 1.5, 'OT 1.5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 19 * 60 + 16, 19 * 60 + 45, 2, 'OT 2h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 19 * 60 + 46, 20 * 60 + 15, 2.5, 'OT 2.5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 20 * 60 + 16, 20 * 60 + 45, 3, 'OT 3h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 20 * 60 + 46, 21 * 60 + 15, 3.5, 'OT 3.5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 21 * 60 + 16, 21 * 60 + 45, 4, 'OT 4h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 21 * 60 + 46, 22 * 60 + 15, 4.5, 'OT 4.5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 22 * 60 + 16, 22 * 60 + 45, 5, 'OT 5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 22 * 60 + 46, 23 * 60 + 15, 5.5, 'OT 5.5h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 23 * 60 + 16, 23 * 60 + 45, 6, 'OT 6h'
where not exists (select 1 from ot_windows);

insert into ot_windows (start_minutes, end_minutes, overtime_hours, label)
select 23 * 60 + 46, 24 * 60, 6.5, 'OT 6.5h'
where not exists (select 1 from ot_windows);