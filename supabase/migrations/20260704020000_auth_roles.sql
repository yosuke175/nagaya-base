-- 入場・ロールモデルの変更（2026-07-04 決定）。
--
-- 方針変更（ADR-003 の運用更新）: これまで新規サインアップは全員 guest だったが、
-- Honmono 内での自己登録を許可する。ただし「クライアントがロールを書く」のではなく、
-- **サインアップ時のトリガー（security definer）がサーバー側で付与**する形にして
-- 自己昇格の穴を作らない:
--   匿名サインイン（ゲスト即入場）           → guest
--   メール登録（パスワード or マジックリンク） → user
-- developer / admin への昇格は引き続き admin のみ（大家メニューで付与予定）。
--
-- 既存ユーザーのロールは変えない（このトリガーは新規 INSERT にのみ効く）。

create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '名無しの入居者'
    ),
    (case when coalesce(new.is_anonymous, false) then 'guest' else 'user' end)::app_role
  );
  return new;
end;
$$;
