# CONTRIBUTING.md — 貢献の手引き

本プロジェクト（コードネーム: NAGAYA-BASE）への参加を歓迎します。
プログラミング経験の深さは問いません。ガジェット開発は
`docs/gadget-spec.md` だけ読めば始められるように設計されています。

## 0. はじめに必ず（CLA への同意）

本プロジェクトへの貢献には、貢献者許諾契約（[CLA.md](./CLA.md)）への同意が
必要です。最初の Pull Request を作成すると、CLA Assistant が同意の確認を
求めます。**CLA に同意していない Pull Request はマージされません。**

なぜ CLA が必要か: 本プロジェクトは将来、Honmono協会のプロダクトとして
事業化する構想があります。全貢献の利用条件を最初から揃えておくことが、
コミュニティと事業の両方を守ります。詳しくは CLA.md と LICENSE を
読んでください。

## 1. 何に貢献できるか

| 貢献先 | 必要な知識 | 入口 |
|---|---|---|
| ガジェット開発 | HTML/CSS/JS（AIに書かせてもOK） | `docs/gadget-spec.md` |
| プラットフォーム本体 | React / TypeScript / Supabase | `docs/architecture.md` と `CLAUDE.md` |
| 文書・翻訳・レビュー | 日本語が書ければOK | `docs/` |
| バグ報告・提案 | 利用者であればOK | Issue |

## 2. 開発フロー（Fork + Pull Request 方式）

1. このリポジトリを Fork する
2. ブランチを切る: `feat/gadget-<id>` / `fix/<内容>` / `docs/<内容>`
3. 変更を加え、コミットする
   - コミットメッセージ: `feat|fix|docs|chore(scope): 概要`
   - 例: `feat(gadgets/daily-scheduler): add voice memo input`
4. Pull Request を作成する（テンプレートに従って記入）
5. CI（マニフェスト検証・Lint・ビルド）が通ることを確認する
6. レビューを受ける
   - `gadgets/*`: 該当ガジェットの owner ＋ admin
   - `platform/` `packages/` `supabase/`: admin が必須レビュアー

直 push 権限は付与していません。全変更が PR を通ることで、
CLA チェックとレビューが機能します。

## 3. AI ツールの利用について

Claude Code その他の AI ツールでコードを書くことを推奨します。
その場合も以下は人間であるあなたの責任です。

- `CLAUDE.md` と `docs/` の規約に反していないことの確認
- 提出前に自分の環境で動作確認していること
- CLA 第6条（第三者権利の非侵害等）が満たされていることの確認

## 4. やってはいけないこと

- 秘密情報（APIキー、トークン、個人情報）のコミット
- `supabase/migrations/` の適用済みファイルの書き換え
- `docs/gadget-spec.md` のマニフェスト仕様・SDK API の無断変更
- 他人のガジェット（`gadgets/<他人のid>/`）への無断変更
  （提案は Issue または該当 owner への PR で）

## 5. ふるまい

技術レベルの違いをからかわない。質問を歓迎する。レビューはコードに向け、
人に向けない。これが守られない場合、admin は貢献の受け入れを
停止することがあります。

## 6. 質問・相談

- 仕様の疑問: Issue を立てる
- 勉強会メンバー: 勉強会のチャンネルでも可
