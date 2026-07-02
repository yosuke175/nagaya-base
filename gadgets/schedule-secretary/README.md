# schedule-secretary — スケジュール秘書

Google カレンダーの今後7日の予定を表示・追加・移動・削除できるガジェット。
案件名とメモは音声入力（Web Speech API）にも対応。

カレンダーへのアクセスは、**ユーザー自身が自分の Google アカウントにデプロイする
GAS WebApp** を経由します（BYOK方式）。プラットフォームに Google の権限は渡しません。

## ファイル構成

```
schedule-secretary/
├── manifest.json    # permissions: ["storage"] / externalServices: gas-webapp (byok)
├── index.html       # ガジェット本体（素のJS）
└── gas/
    ├── Code.gs      # ユーザーが自分の Apps Script に貼るコード
    └── SETUP.md     # 非エンジニア向けセットアップ手順（10〜15分）
```

## 使い始めるまで

1. [gas/SETUP.md](gas/SETUP.md) の手順で GAS WebApp をデプロイ
2. ガジェットの「連携設定をひらく」から `WebAppのURL 半角スペース 合言葉` を登録

クレデンシャル形式: `https://script.google.com/macros/s/xxx/exec TOKEN`
（JSON `{"url":"...","token":"..."}` も可）。URL・トークンは
`gadget.services.getCredential("gas-webapp")` 経由でのみ扱い、コード・storage には保存しません。

## 開発

```bash
npm run dev:gadget schedule-secretary
```

## 実装メモ

- GAS WebApp への POST は `Content-Type: text/plain` で送る（GAS は CORS プリフライトに
  応答しないため。`doPost` は `e.postData.contents` で受けるので動作は同じ）
- GAS の応答は数秒かかる前提で、全操作にローディング表示・30秒タイムアウトあり
- `gadget.storage` は取得済み予定のキャッシュにのみ使用（起動直後に前回分を即表示）
- sandbox iframe では `confirm()` が使えないため、削除は2段階ボタンで確認
- 音声入力は `SpeechRecognition` 非対応ブラウザではボタン自体を出さない

## 既知の制限

- クレデンシャルの保存は現在プラットフォーム側の localStorage モック
  （暗号化なし・その端末のみ有効）。ADR-005 の Workers 側 AES-GCM 暗号化への移行は
  docs/backlog.md 参照
- GAS WebApp の応答は `script.googleusercontent.com` への302リダイレクトを経由するため、
  manifest の `baseUrls` に両ドメインを宣言している（spec v1.1）

## ロードマップ

- v0.2: 自然言語の解釈・AI による予定提案（今回スコープ外）
