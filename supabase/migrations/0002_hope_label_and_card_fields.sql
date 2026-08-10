-- 「会衆の伝道者記録」(S-21相当)の公式書式に合わせて希望の表記を修正:
-- 「油そそがれた者」→「天に行く者」

update publishers set hope = '天に行く者' where hope = '油そそがれた者';

alter table publishers drop constraint publishers_hope_check;
alter table publishers add constraint publishers_hope_check check (hope in ('ほかの羊', '天に行く者'));
