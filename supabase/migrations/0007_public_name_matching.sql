-- 公開報告フォームの氏名入力を、一覧選択(全員の氏名がブラウザに送られる)から
-- 自由記述+サーバー側の名前照合に変える。狙いは、リンクを開いた第三者に
-- 会衆全員の氏名が見える状態を無くすこと。
--
-- 照合はこの関数の中(データベース側)だけで完結させ、候補一覧を
-- クライアントに送らない。表記ゆれの扱いは3段階:
--   1. 空白(半角/全角)の有無・数だけの違いは、除去して比較すれば完全一致 → 確認なしで進む
--   2. 読み仮名で入力された場合も、読み仮名列との完全一致 → 確認なしで進む
--   3. 上記で一致しないが、1文字程度の入力ミスに近い候補が一意に定まる場合だけ、
--      「〇〇さんですか?」と本人に確認する(自動では確定しない)。似た名前の
--      候補が複数いる場合は、誤って決めつけないよう候補なし扱いにする

create extension if not exists fuzzystrmatch;

create function public_match_publisher(p_name text)
returns table (
  id uuid,
  last_name text,
  first_name text,
  pioneer_status text,
  group_id uuid,
  monthly_hour_target integer,
  exact boolean
)
language plpgsql
security definer
stable
as $$
declare
  normalized text := regexp_replace(coalesce(p_name, ''), '[[:space:]　]+', '', 'g');
  best_id uuid;
  best_last text;
  best_first text;
  best_status text;
  best_group uuid;
  best_target integer;
  best_dist integer;
  second_dist integer;
begin
  if normalized = '' then
    return;
  end if;

  -- 1. 氏名(漢字表記)の完全一致
  return query
    select p.id, p.last_name, p.first_name, p.pioneer_status, p.group_id, p.monthly_hour_target, true
    from publishers p
    where p.is_active
      and regexp_replace(p.last_name || p.first_name, '[[:space:]　]+', '', 'g') = normalized
    limit 1;
  if found then return; end if;

  -- 2. 読み仮名の完全一致
  return query
    select p.id, p.last_name, p.first_name, p.pioneer_status, p.group_id, p.monthly_hour_target, true
    from publishers p
    where p.is_active
      and p.last_name_kana is not null and p.first_name_kana is not null
      and regexp_replace(p.last_name_kana || p.first_name_kana, '[[:space:]　]+', '', 'g') = normalized
    limit 1;
  if found then return; end if;

  -- 3. 近似一致(編集距離1以内)。候補が複数同着の場合は決めつけない
  select p.id, p.last_name, p.first_name, p.pioneer_status, p.group_id, p.monthly_hour_target,
         levenshtein(regexp_replace(p.last_name || p.first_name, '[[:space:]　]+', '', 'g'), normalized)
    into best_id, best_last, best_first, best_status, best_group, best_target, best_dist
    from publishers p
    where p.is_active
    order by levenshtein(regexp_replace(p.last_name || p.first_name, '[[:space:]　]+', '', 'g'), normalized)
    limit 1;

  if best_dist is null or best_dist > 1 then
    return;
  end if;

  select levenshtein(regexp_replace(p.last_name || p.first_name, '[[:space:]　]+', '', 'g'), normalized)
    into second_dist
    from publishers p
    where p.is_active and p.id <> best_id
    order by levenshtein(regexp_replace(p.last_name || p.first_name, '[[:space:]　]+', '', 'g'), normalized)
    limit 1;

  if second_dist is not null and second_dist <= best_dist then
    return;
  end if;

  return query select best_id, best_last, best_first, best_status, best_group, best_target, false;
end;
$$;

grant execute on function public_match_publisher(text) to anon;

-- 一覧をまるごと返す旧経路(anonのみが使っていた)は不要になったため削除する
drop view if exists public_publisher_roster;
