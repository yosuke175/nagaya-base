# supabase/

DBマイグレーションを `migrations/` に置く（SQLファイルのみ）。

- スキーマの骨子は [docs/architecture.md](../docs/architecture.md) ADR-003 を参照
- **適用済みマイグレーションは書き換えない。変更は必ず新しいマイグレーションファイルの追加で行う**（CLAUDE.md DO NOT 5）
- 全テーブルにRLSを適用する。認可の最終防衛線はRLS（ADR-003）
- Phase 1 scaffold の時点ではマイグレーションは未作成（Supabase接続は次のイテレーション）

```bash
npm run db:migrate   # supabase migration up（ローカル。Supabase CLI が必要）
```
