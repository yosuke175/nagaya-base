-- AIゲートウェイの利用量記録＋レート制限の土台（backlog #3 / NFR-05）。
--
-- gadget.ai は各自のAPIキー（BYOK）で /api/ai 経由で呼ぶ。暴走ガジェットが
-- 本人のキーを浪費するのを防ぐため、1時間あたりの complete 回数を数えて上限を
-- かける。同じ表を「透明性のための利用ログ」にも使う。
--
-- 書き込みは service_role（Function）のみ。本人は自分の記録を閲覧できる。

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  provider text not null,
  model text not null,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  created_at timestamptz not null default now()
);

-- レート制限のカウント（user_id × 直近時間）を速くする
create index ai_usage_user_time on ai_usage (user_id, created_at desc);

alter table ai_usage enable row level security;

-- 本人は自分の利用記録だけ読める。書き込みポリシーは作らない
-- （Function=service_role と、RLSをバイパスする経路のみが書ける）。
create policy ai_usage_select_own on ai_usage
  for select using (user_id = auth.uid());

grant select on table ai_usage to authenticated;
grant all on table ai_usage to service_role;
-- identity 列のシーケンス取りこぼしを防ぐ（room_no_seq の教訓）
grant usage, select on all sequences in schema public to authenticated, service_role;
