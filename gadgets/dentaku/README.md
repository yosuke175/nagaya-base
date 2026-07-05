# _template — ガジェット雛形

自分のガジェットを作るときは、このディレクトリをコピーしてください
（詳しい手順・仕様は [docs/gadget-spec.md](../../docs/gadget-spec.md) だけ読めばOKです）。

```bash
cp -r gadgets/_template gadgets/my-gadget
npm run dev:gadget my-gadget
```

コピーしたら必ず:

1. `manifest.json` の `id` を **ディレクトリ名と同じ値** に変更する
   （半角英小文字・数字・ハイフン、3〜40文字。`_template` 自体は公開対象外の雛形なのでこの規則の例外です）
2. `name` / `description` / `author` を自分のものに書き換える
3. 使うSDK機能を `permissions` に宣言する（宣言していない機能の呼び出しは拒否されます）

## この雛形がやっていること

- `createGadget()` でプラットフォームとハンドシェイク
- `gadget.storage.get / set` でカウンタを保存・復元（`permissions: ["storage"]` が必要）

## AI を使いたいとき（permissions: "ai"）

`manifest.json` の `permissions` に `"ai"` を追加すると、AI による文章生成が使えます。
API キーは**ユーザーがプラットフォームの「AI設定」に登録したもの**が使われ、
ガジェットには渡されません（返ってくるのは生成テキストのみ）:

```js
const text = await gadget.ai.complete({
  system: "あなたは俳句の先生です",                  // 任意
  messages: [{ role: "user", content: "秋の俳句を1句" }],
  maxTokens: 500,                                    // 任意
});
```

- タイムアウトは30秒（他のSDK呼び出しは10秒）
- ユーザーがキー未登録の場合はエラー（メッセージに「AI設定」への誘導が含まれます）
- 詳細は gadget-spec.md §4・§5

## 知っておくこと

- ダッシュボードに初めて表示されるとき、ユーザーには `permissions` と
  `externalServices` の**承認画面**が表示されます（承認されるまでガジェットは動きません）
- 外部サービスと通信する場合は `externalServices` の `baseUrls`（配列）に通信先を宣言します。
  宣言していないドメインへの通信は CSP でブロックされます（詳細は gadget-spec.md §3）
