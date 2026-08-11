-- 正規開拓者・特別開拓者・野外の宣教者向けの月間要求時間。
-- 年間要求時間(旧annual_hour_target)とは別に、開拓者進捗ページの色分け判定に使う。
alter table publishers add column monthly_hour_target integer;
