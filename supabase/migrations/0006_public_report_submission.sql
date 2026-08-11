-- ログイン不要の報告フォーム(Googleフォームの代替)向けの設定。
-- 未ログイン(anonロール)から許可するのは「氏名一覧の閲覧に必要な最小限の列」「その月に
-- 既に提出済みかどうかの確認」「service_reportsへの書き込み(追加・上書き)」の3つだけで、
-- 生年月日やバプテスマ日などの個人情報を含む publishers の全列や、他の報告内容の閲覧は
-- 一切許可しない。

-- 氏名選択に必要な最小限の列だけを公開するビュー(publishers本体のRLSはstaff限定のまま)。
-- ビューはデフォルトで作成者(postgres)の権限で実行されるため、
-- 元テーブルのRLS(staff限定)を経由せずにここで指定した列だけを返せる
create view public_publisher_roster as
  select id, last_name, first_name, romaji, pioneer_status, group_id, monthly_hour_target
  from publishers
  where is_active = true;

grant select on public_publisher_roster to anon;

-- 「その伝道者のその月の報告が既に存在するか」だけを返す関数。
-- 中身(時間・備考など)は一切返さないことで、他の報告内容が漏れないようにしている
create function public_report_exists(p_publisher_id uuid, p_year integer, p_month integer) returns boolean
  language sql security definer stable as $$
  select exists(
    select 1 from service_reports
    where publisher_id = p_publisher_id and year = p_year and month = p_month
  );
$$;

grant execute on function public_report_exists(uuid, integer, integer) to anon;

-- 未ログインからの報告の追加・上書き(同じ人・同じ月への再送信は上書き)を許可する。
-- 閲覧(select)・削除は許可しない
create policy service_reports_public_insert on service_reports for insert to anon with check (true);
create policy service_reports_public_update on service_reports for update to anon using (true) with check (true);
