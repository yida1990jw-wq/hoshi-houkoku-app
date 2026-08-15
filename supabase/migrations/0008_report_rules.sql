-- 報告のルール(考慮時間の上限など)を、コードを直さずに設定画面から変えられるようにする。
--
-- 値は必ず1行だけ持つ(id=1 固定)。列を増やせば設定項目が増える、という単純な作りにしている
-- (キーと値の表にすると型が全部文字列になり、入力の検証が面倒になるため)。
--
-- 未ログイン(anon)にも読める必要がある。ログイン不要の報告フォームが、考慮時間の上限や
-- 補助開拓の選択肢をこの値に従って計算するため。中身は数値と短い語句だけで個人情報は含まない。
-- 書き込みは管理者だけ。

create table report_rules (
  id integer primary key default 1 check (id = 1),
  -- 考慮時間の上限。奉仕時間+考慮時間がこの値を超える場合、超えない分まで自動調整する
  considered_hours_cap integer not null default 55 check (considered_hours_cap between 1 and 999),
  -- 上限を適用しない考慮理由(この理由が選ばれていれば入力値をそのまま採用する)
  considered_cap_exempt_reason text not null default '開拓者学校',
  -- 補助開拓の選択肢(時間)。伝道者に「補助開拓をしましたか」と尋ねる際の選択肢
  aux_pioneer_hours integer[] not null default '{15,30}',
  updated_at timestamptz not null default now()
);

insert into report_rules (id) values (1);

alter table report_rules enable row level security;

-- 報告フォームは未ログインで動くため、読み取りは全員に許可する
create policy report_rules_select on report_rules for select using (true);
create policy report_rules_write on report_rules for all
  using (is_admin()) with check (is_admin());
