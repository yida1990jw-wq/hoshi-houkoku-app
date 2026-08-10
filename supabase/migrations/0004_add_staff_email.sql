-- 管理画面でスタッフ一覧にメールアドレスを表示するための列。
-- auth.usersのメールアドレスをここにも保持しておくことで、一覧表示のたびに
-- service-role権限が必要なauth.admin APIを呼ばずに済む(招待時にここへ書き込む)。
alter table staff add column email text;
