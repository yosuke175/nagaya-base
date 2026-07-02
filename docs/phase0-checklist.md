# phase0-checklist.md — 立ち上げ手順（実行順・無料先行版）

Step 1〜6 は完全無料。費用が発生するのは Step 7（ドメイン、年2,000円前後）のみで、
実行タイミングは任意（推奨トリガー: Phase 1 デモ成功後）。

## Step 1: 個人アカウント直下にリポジトリ作成 【無料・今日やる】

- [ ] 向井の既存個人アカウント直下にリポジトリ `nagaya-base` を **Private** で作成
      ※ 名称は仮。リポジトリの改名・将来のOrganizationへの移管は
      リダイレクト付きで無料のため、名前が変わっても失うものはない
      ※ Organization の作成は名称確定後（Step 6 前後）に行い、リポジトリを移管する
- [ ] Public化はライセンス・CLA整備後、かつ名称確定後

## Step 2: 法的文書を最初のコミットにする（コードより先） 【無料】

- [ ] `LICENSE`（BSL 1.1、Additional Use Grant と Change Date を記載）
- [ ] `CLA.md`（貢献者許諾契約の文面）
- [ ] `CONTRIBUTING.md`（CLA同意手順、ブランチ運用、PR規約）
- [ ] `CLAUDE.md` と `docs/` 5文書を配置
- [ ] 初回コミット: 「Initial commit: license, CLA, and project documents」

**なぜコードより先か**: BSL/CLAが「コード1行目から適用されていた」状態をコミット履歴で証明するため。

## Step 3: インフラアカウント作成 【無料】

- [ ] Cloudflare アカウント作成（暫定: 向井の個人メール。Step 7 後に admin@ へ変更）
- [ ] Pages プロジェクトを作成しリポジトリと接続（プロジェクト名は仮でよい。
      pages.dev サブドメインは名称確定まで対外共有しない）
- [ ] Supabase アカウント作成（同じく暫定メール）→ プロジェクト `nagaya-base`（ap-northeast-1）
- [ ] 認証情報は 1Password 等に集約。支払い登録は不要（両方とも無料枠で開始）

## Step 4: リポジトリの保護設定 【無料】

- [ ] `main` ブランチ保護: PR必須、レビュー1名以上、force push禁止
- [ ] CODEOWNERS: `platform/` `packages/` `supabase/` は向井を必須レビュアーに、`gadgets/*` は各owner
- [ ] CLA Assistant 導入（CLA未同意のPRをブロック）
- [ ] Secret scanning / Dependabot 有効化

## Step 5: 開発開始 【無料】

- [ ] Claude Code への最初の指示:
      「CLAUDE.md と docs/ を読み、requirements.md §7 Phase 1 の scaffold を作成。
      gadgets/_template と gadget-sdk のハンドシェイク部分から着手」
- [ ] Phase 1 完了（サンプルガジェット1個がSDK経由で動く）までメンバーは招待しない

## Step 6: メンバー招待（Phase 1 デモ後） 【無料】

- [ ] 勉強会でデモ → CLA説明 → developerロールで招待（Fork + PR 方式から開始）

## Step 7: ドメインと専用メール 【ここで初めて費用発生: 年2,000円前後】

推奨トリガー: Phase 1 デモが成功し、継続が決まった時点。
（名前を確実に守りたければ前倒し可。判断基準は「nagaya-base.app を他人に取られた場合の痛み」）

- [ ] Cloudflare Registrar で `nagaya-base.app` 取得（.com 防衛取得は任意）
- [ ] Email Routing で `admin@nagaya-base.app` → 向井Gmail に転送設定
- [ ] Cloudflare / Supabase / GitHub Org の登録・通知メールを admin@ に切り替え
- [ ] Pages にカスタムドメインを接続

## 保留中の意思決定（進行を妨げないが、期限あり）

| 項目 | 期限 |
|---|---|
| 収益分配ポリシーの明文化（推奨: 分配なし・クレジット表記） | Step 6 の前 |
| ドメイン取得の前倒し要否 | 向井の判断 |
| Honmono協会名義の使用について協会側の承認取得 | B2B言及を対外的に行う前 |
| 商標出願の要否判断（弁理士相談） | B2Bフェーズ開始時 |

## コストの全体像（勉強会フェーズ）

| 項目 | 費用 |
|---|---|
| GitHub Org / Actions / CLA Assistant | 0円 |
| Cloudflare Pages / Workers / Email Routing | 0円（無料枠） |
| Supabase | 0円（無料枠。休止仕様が問題化したら Pro $25/月 を協議） |
| ドメイン nagaya-base.app | 約2,000円/年（Step 7 まで発生しない） |
