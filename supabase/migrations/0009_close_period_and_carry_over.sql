-- 月の「確定」と、確定後に遅れて出された報告の翌月への付け替え。
--
-- 【確定】全員の報告がそろって集計を確定したあと、報告フォームからの追加・上書きを止める。
-- 報告フォームは未ログインで動き、anonキーはJavaScriptに埋め込まれて公開されているため、
-- 画面でボタンを隠すだけでは防げない。データベース側(RLS)で拒否する必要がある。
--
-- 【付け替え】確定後に遅れて提出された報告は、組織の指示により翌月の会衆の報告に加算し、
-- 「報告の数」はそれに合わせて調整する。本人の伝道者記録には遅れたかどうかに関係なく
-- 実際の月として記録するため、伝道者記録と会衆集計とで数える月が食い違う。
-- そこで「会衆集計だけ別の月に数える」ための列を持たせる。

-- ---- 確定した年度・月 ----
create table closed_periods (
  year integer not null,
  month integer not null check (month between 1 and 12),
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users (id) on delete set null,
  primary key (year, month)
);

alter table closed_periods enable row level security;
create policy closed_periods_select on closed_periods for select using (is_staff());
create policy closed_periods_write on closed_periods for all using (is_admin()) with check (is_admin());

-- 未ログインにはテーブル自体を見せず、判定結果だけを返す
create function is_period_closed(p_year integer, p_month integer) returns boolean
  language sql security definer stable as $$
  select exists (select 1 from closed_periods where year = p_year and month = p_month);
$$;

grant execute on function is_period_closed(integer, integer) to anon;

-- 確定済みの月には未ログインから書き込めないようにする(新規投稿・上書きとも)
drop policy service_reports_public_insert on service_reports;
drop policy service_reports_public_update on service_reports;

create policy service_reports_public_insert on service_reports for insert to anon
  with check (not is_period_closed(year, month));
create policy service_reports_public_update on service_reports for update to anon
  using (not is_period_closed(year, month))
  with check (not is_period_closed(year, month));

-- ---- 会衆集計だけ別の月に数えるための列 ----
-- 空欄なら自分の年度・月に数える(従来どおり)。値があれば会衆集計だけその月に数える。
-- 伝道者記録は year / month をそのまま使うので影響を受けない。
alter table service_reports
  add column counted_in_year integer,
  add column counted_in_month integer check (counted_in_month between 1 and 12);

comment on column service_reports.counted_in_year is
  '会衆集計で数える年度。空欄なら year を使う。確定後に遅れて提出された報告を翌月に加算するために使う';
comment on column service_reports.counted_in_month is
  '会衆集計で数える月。空欄なら month を使う';
