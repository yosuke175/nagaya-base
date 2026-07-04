# backlog.md — 技術バックログ

実装を先送りした項目の追跡リスト。着手時は担当を決めて Issue / PR に移すこと。

| # | 項目 | 内容 | 着手目安 |
|---|---|---|---|
| 1 | ADR-005 暗号化の本実装 | **実装済み（2026-07-03）**: `functions/api/credentials.ts` が AES-GCM 暗号化して `user_credentials` に保管（AI設定・BYOK とも、ログイン時はアカウント保存）。残タスク: 鍵ローテーション手順の文書化、localStorage フォールバック分の移行導線 | 残タスクのみ |
| 3 | AIゲートウェイの実装（ADR-008） | **起草済み（2026-07-03、architecture.md ADR-008）**。残タスク: `gadget.ai` の裏側をクライアント直呼びから Workers 経由のゲートウェイ（サーバ側呼び出し・利用量記録 NFR-05・レート制限・モデル許可リスト）へ差し替える。ガジェット側の変更は不要 | Workers 導入時 |
| 2 | ADR-007（GAS橋方式）の起草 | **完了（2026-07-03、architecture.md ADR-007 として起草）** | 完了 |
| 8 | 独自SMTPの設定（メンバー招待前に必須） | **設定済み（2026-07-04）**: Brevo（無料枠300通/日）を Supabase（Authentication → Emails → Custom SMTP）に接続。送信元 `yo-mukai@honmono-all.com`（Sender name: NAGAYA-BASE）、host `smtp-relay.brevo.com:587`。送信レート上限（Rate Limits → Emails per hour）を 100 に引き上げ済み。認証情報は Supabase 管理画面のみ（リポジトリ非保管）。**残タスク（任意・優先度低）**: honmono-all.com のドメイン認証（DKIM）。未認証のため From が Brevo サブドメイン（`…@11591849.brevosend.com`）に書き換わり、honmono-all.com は Reply-To のみ。DMARC は `p=none` のため到達は問題なし（受信トレイ着）。DNS は **Wix**（ns0/ns1.wixdns.net）管理 → Brevo「Ask someone else to authenticate」でサイト担当に依頼可。身内運用のうちは現状維持で可 | 設定済み／DKIM は運営調整後 |
| 5 | 開発フローの PR 全面移行（A案） | **建立会（メンバー初参加日）当日に実施**。それまでは Claude Code / 管理者の作業は main への直 push（B案）を継続する（admin バイパスの "Bypassed rule violations" 警告は既知・許容）。建立会をもって全作業を PR 経由に切り替え、直 push を停止する（決定日: 2026-07-03） | 建立会当日 |
| 7 | gadget.ai の複数プロバイダ対応 | **完了（2026-07-04）**: `/api/ai` が anthropic/openai/google を各社形式に変換して呼ぶ。AI設定にプロバイダ選択、案内所に「AIの使い方」ページ（各社キー取得手順）。残: OpenAI互換の任意エンドポイント対応、モデル一覧の追随 | 追加要望を見て |
| 6 | 交流レイヤー・フェーズ2（双方向） | メッセージボード・コメント・在室/オンライン表示・相互通知・リアクション等の**双方向機能は意図的に未実装**（過疎の可視化を避ける設計原則）。**着手条件: 実働入居者が増え、一方向の情報（回覧板・速報・歩み）に自然な反応が生まれ始めた時**。フェーズ1（一方向: 回覧板/速報！/長屋暦/案内所/長屋の歩み）は 2026-07-04 実装完了でクローズ。メール/プッシュ通知も同様に保留 | 条件成立まで保留 |
| 4 | AIキーの Function 代理実行（/api/ai） | セキュリティ検収（2026-07-03 journal）の指摘。gadget.ai の Anthropic 呼び出しを Pages Function に移し、**復号済み AI キーをクライアントに一切返さない**ようにする（XSS 耐性向上）。ADR-008 ゲートウェイの第一歩として #3 より先に実施可 | 次イテレーション候補 |
| 9 | 退去（本人によるアカウント削除） | **実装済み（2026-07-04）**: 入居者情報の最下部に危険操作エリア。個人データ（profiles/installations/gadget_storage/user_credentials）は必ず削除。作った道具の扱いは本人が2択（**既定=長屋に残す**: `owner_id`→null で大家預かり・公開維持／**下げる**: `status='suspended'`）。auth 削除は `/api/leave`（service_role）でのみ実行。**著作権はUIに一切出さない（ADR-006 現状維持: 著作権は作者に残る／CLA許諾は撤回不可。放棄させると純OSS化と同じ問題でB2B価値を毀損）**。最後の大家は退去不可（管理者不在防止）。DB: migration `20260704080000` で profiles 参照の6 FK を `on delete set null` 化。残タスク（任意）: 道具の完全削除に大家承認を挟む導線、退去後の惜別画面 | 実装済み |
