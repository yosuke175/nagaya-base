# 道具（ガジェット）の作り方

正式な仕様は [gadget-spec.md](https://github.com/yosuke175/nagaya-base/blob/main/docs/gadget-spec.md) にあります。
**この1つの文書だけ読めば作れる**ように書かれています。ここでは流れだけ紹介します。

## 流れ

1. 雛形をコピーする（セットアップウィザードなら自動）
2. `manifest.json` に道具の名前・使う機能（permissions）を書く
3. HTML + JS で中身を作る（React でも素の JS でも、AI に書かせても OK）
4. `npm run dev:gadget 自分のID` で動かして確認
5. PR を出す → CI チェック → マージで道具市に公開

## 道具からできること（SDK）

- **storage** — 自分の道具×自分のユーザー専用の保存領域
- **ai** — AI に文章を作らせる（使う人が登録した AI キーを消費）
- **microphone** — 音声入力
- 外部サービス連携 — 使う人が自分のキーを登録する方式（BYOK）

道具は安全な枠（sandbox）の中で動き、宣言していない機能・通信先は使えません。

## AI に作らせるコツ

ウィザード完成画面の「AI ツールに貼る最初の指示文」をコピーして、
docs/gadget-spec.md と雛形を読ませてから改造を頼むのが早道です。
