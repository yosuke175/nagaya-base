# backlog.md — 技術バックログ

実装を先送りした項目の追跡リスト。着手時は担当を決めて Issue / PR に移すこと。

| # | 項目 | 内容 | 着手目安 |
|---|---|---|---|
| 1 | ADR-005 暗号化の本実装 | BYOKクレデンシャルの保存を localStorage モックから、Workers での AES-GCM 暗号化（鍵は Workers Secret）+ Supabase 保存へ移行する。復号済みキーを返すのは該当ガジェットの実行コンテキストへの受け渡し時のみ。対象コード: `platform/src/host/gadgetHost.ts` の `credentialStore`（TODO(ADR-005) コメントあり） | Supabase 接続イテレーション |
| 3 | ADR-008（AIゲートウェイ）の起草と実装 | `gadget.ai` の裏側を、クライアント直呼び（現状: ユーザーキーを platform クライアントが保持し Anthropic を直接呼ぶ）から Workers 経由の AI ゲートウェイへ差し替える。キーの AES-GCM 暗号化保管（#1 と同様）、利用量の記録（NFR-05）、モデル許可リスト、レート制限を含む。**ガジェットに見せる口は gadget.ai のみ**なのでガジェット側の変更なしで差し替え可能 | Workers 導入時 |
| 2 | ADR-007（GAS橋方式）の起草 | GAS WebApp を BYOK 外部連携の「橋」として使うパターンを ADR として明文化する。含めるべき内容: `text/plain` POST でプリフライト回避、302 リダイレクト先 `script.googleusercontent.com` の baseUrls 宣言、Script Properties の SHARED_TOKEN 方式、「実行ユーザー: 自分 / アクセス: 全員」デプロイの意味とリスク。参考実装: `gadgets/schedule-secretary/` | Phase 2 |
