-- 工房（フェーズ: 職人の作業場）と、道具市の「構築中は出さない」対応。
--
-- 道具市（カタログ）はファイル由来（gadgets/*/manifest.json）で全件が並ぶが、
-- DB の gadgets 行に status を持つ道具は、その状態で表示可否を切り替えたい:
--   published → 道具市に出す / draft・in_review・suspended → 出さない（owner と admin には見せる）。
-- ところが gadgets の RLS は他人の draft 行を返さないため、カタログ側で状態を
-- 判定できない。そこで「全道具の id/status/owner」を返す security definer 関数を用意する
-- （道具のコードはリポジトリ上で公開されているので、状態の可視化は問題ない）。

create function gadget_visibility()
returns table (id text, status text, owner_id uuid)
language sql stable security definer
set search_path = public
as $$
  select id, status, owner_id from gadgets;
$$;

grant execute on function gadget_visibility() to authenticated, anon;
