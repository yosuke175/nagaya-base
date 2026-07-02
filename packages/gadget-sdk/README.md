# gadget-sdk

ガジェット開発者向けSDK。**使い方は [docs/gadget-spec.md](../../docs/gadget-spec.md) を読めば十分**で、
platform/ 内部の知識は不要です（この方針は CLAUDE.md で保証されています）。

ガジェットからは次のようにインポートします（開発サーバ・本番とも同じパス）:

```js
import { createGadget } from "/sdk/gadget-sdk.js";
```

## 実装状況（Phase 1 scaffold）

| API | 状態 |
|---|---|
| `createGadget()`（ハンドシェイク） | 実装済み |
| `gadget.storage.get / set` | 実装済み（プラットフォーム側はモック応答） |
| `gadget.services.getCredential / requestSetup` | 実装済み（保存は localStorage モック。暗号化は docs/backlog.md #1） |
| `gadget.storage.remove / list` | 未実装 |
| `gadget.notify` / `gadget.ui.*` / `gadget.user.*` | 未実装 |

プロトコル（postMessage の型定義）はこのパッケージからエクスポートされ、
platform 側ホストも同じ型を参照します。**docs/gadget-spec.md の更新なしに
プロトコルを変更しないこと**（CLAUDE.md DO NOT 3）。

## ビルド

```bash
npm run build --workspace gadget-sdk   # dist/index.js（開発サーバが /sdk/gadget-sdk.js として配信）
```
