-- 転入者の転入前データなど、本人の記録(伝道者記録・開拓者進捗・年度末お知らせ)には残すが、
-- 会衆としての集計(会衆集計・提出状況)には反映させたくない報告のためのフラグ。
-- 立場(pioneer_status_snapshot)自体は実際にその月何をしていたかをそのまま保持する
-- (例: 転入前に補助開拓をしていた月は「補助開拓者」のまま。伝道者記録のチェックボックス表示に使うため)。

alter table service_reports add column no_count boolean not null default false;
