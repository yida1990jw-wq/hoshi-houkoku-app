-- 奉仕報告アプリ 初期スキーマ
-- Supabase の SQL Editor にそのまま貼り付けて実行してください。

create extension if not exists pgcrypto;

-- ---- groups (村野/春日/大峰/津田 などの地区グループ) ----
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into groups (name) values ('村野'), ('春日'), ('大峰'), ('津田');

-- ---- publishers (名簿) ----
create table publishers (
  id uuid primary key default gen_random_uuid(),
  last_name text not null,
  first_name text not null,
  last_name_kana text,
  first_name_kana text,
  romaji text,
  gender text not null check (gender in ('男性', '女性')),
  birth_date date,
  baptism_date date,
  dedication text not null check (dedication in ('兄弟', '姉妹')),
  hope text not null check (hope in ('ほかの羊', '油そそがれた者')),
  group_id uuid references groups (id) on delete set null,
  elder_qualified_on date,
  servant_qualified_on date,
  pioneer_started_on date,
  qualification text check (qualification in ('長老', '援助奉仕者')),
  -- Excelの「立場」に相当。報告の時点の身分は service_reports.pioneer_status_snapshot に別途保持する
  pioneer_status text not null default '伝道者'
    check (pioneer_status in ('伝道者', '補助開拓者', '正規開拓者', '特別開拓者', '野外の宣教者', '不活発者')),
  -- 開拓者の年間時間目標(例: 正規開拓者600h)。Excelの`開拓者進捗`シートの「要求時間」列相当で、
  -- 立場から自動算出せず個別設定できるようにしている
  annual_hour_target integer,
  is_active boolean not null default true,
  -- 各伝道者が「名前+PIN」でログインする際に Supabase Auth のユーザーと紐付けるための列(Phase 2で使用)
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index publishers_group_id_idx on publishers (group_id);
create index publishers_last_name_kana_idx on publishers (last_name_kana);

-- ---- service_reports (奉仕報告) ----
-- year は「奉仕年度」ラベル(9月始まり〜翌年8月まで、開始年で表記)。
-- 例えば 2025年9月〜2026年8月の報告はすべて year=2025 として保存する(Excelの運用を踏襲)。
create table service_reports (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references publishers (id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  preached boolean not null default false,
  bible_studies integer not null default 0,
  hours integer not null default 0,
  considered_hours integer not null default 0,
  remarks text,
  -- 報告時点の立場のスナップショット(過去の実績を当時の身分のまま参照するため)
  pioneer_status_snapshot text not null,
  created_at timestamptz not null default now(),
  unique (publisher_id, year, month)
);

create index service_reports_year_month_idx on service_reports (year, month);

-- ---- staff (管理者・監督者アカウント) ----
create table staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'overseer')),
  display_name text not null
);

-- 最初の管理者アカウントは Supabase Auth でユーザーを作成した後、以下のように手動で1件投入する:
-- insert into staff (user_id, role, display_name) values ('<auth.usersのUUID>', 'admin', '氏名');

-- ---- RLS helper functions ----
create function is_staff() returns boolean
  language sql security definer stable as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

create function is_admin() returns boolean
  language sql security definer stable as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'admin');
$$;

create function current_publisher_id() returns uuid
  language sql security definer stable as $$
  select id from publishers where auth_user_id = auth.uid();
$$;

-- ---- RLS policies ----
alter table groups enable row level security;
alter table publishers enable row level security;
alter table service_reports enable row level security;
alter table staff enable row level security;

create policy groups_select on groups for select using (is_staff() or current_publisher_id() is not null);
create policy groups_write on groups for all using (is_admin()) with check (is_admin());

create policy publishers_select on publishers for select
  using (is_staff() or id = current_publisher_id());
create policy publishers_write on publishers for all
  using (is_admin()) with check (is_admin());

create policy service_reports_select on service_reports for select
  using (is_staff() or publisher_id = current_publisher_id());
create policy service_reports_write on service_reports for all
  using (is_admin()) with check (is_admin());

create policy staff_select on staff for select using (is_staff());
create policy staff_write on staff for all using (is_admin()) with check (is_admin());
