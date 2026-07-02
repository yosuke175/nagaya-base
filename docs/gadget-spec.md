# gadget-spec.md — ガジェット開発仕様 v1.1

この文書だけを読めばガジェットが作れる、を目標にした仕様書です。
プラットフォーム内部のコードを読む必要はありません。
不明点は勉強会のチャンネルで質問してください。

## 1. ガジェットとは

- プラットフォームのダッシュボード上の枠（iframe）の中で動く、独立した小さなWebアプリです
- HTML + CSS + JavaScript で動くものなら何でも構いません（React でも Vue でも素の JS でも、AIに全部書かせても OK）
- プラットフォームの機能（データ保存など）は、配布される **gadget-sdk** を通じてだけ使えます

## 2. 最短の始め方

```bash
# リポジトリを clone して
npm install

# 雛形をコピー（my-gadget を自分のガジェットIDに）
cp -r gadgets/_template gadgets/my-gadget

# 開発サーバ起動（本番と同じsandbox内で動作確認できます）
npm run dev:gadget my-gadget
```

ガジェットIDの規則: 半角英小文字・数字・ハイフンのみ、3〜40文字、リポジトリ内で一意。

## 3. マニフェスト（manifest.json）

各ガジェットのルートに必ず置きます。これがプラットフォームとの契約書です。

```json
{
  "manifestVersion": 1,
  "id": "daily-scheduler",
  "name": "1日スケジューラ",
  "version": "0.1.0",
  "description": "その日のタスクを音声メモから整理するガジェット",
  "author": { "name": "山田太郎", "contact": "yamada@example.com" },
  "entry": "index.html",
  "size": { "default": "medium", "supported": ["medium", "large", "full"] },
  "permissions": ["storage", "notify"],
  "externalServices": [
    {
      "id": "anthropic-api",
      "name": "Claude API",
      "auth": "byok",
      "baseUrls": ["https://api.anthropic.com"],
      "purpose": "音声メモのテキストをタスクに構造化するため"
    }
  ]
}
```

### フィールド定義

| フィールド | 必須 | 内容 |
|---|---|---|
| manifestVersion | ✔ | 現在は `1` 固定 |
| id | ✔ | ガジェットID（ディレクトリ名と一致させる） |
| name / description | ✔ | カタログに表示される名前と説明（日本語可） |
| version | ✔ | semver。公開申請のたびに上げる |
| author | ✔ | 表示名と連絡先 |
| entry | ✔ | iframe にロードされるHTML（ガジェットルートからの相対パス） |
| size.default | ✔ | `small`(1x1) / `medium`(2x1) / `large`(2x2) / `full`(横幅いっぱい) |
| permissions | ✔ | 使用するSDK機能の宣言（§5参照）。宣言していない機能の呼び出しは実行時に拒否されます |
| externalServices | – | 外部サービスを使う場合は必ず宣言。`auth` は `byok` のみ（v1）。通信先は `baseUrls`（配列）で宣言し、宣言外への通信はCSPでブロックされます。リダイレクト先が別ドメインの場合（例: GAS WebApp の `script.googleusercontent.com`）はそれも宣言に含めること。旧形式の `baseUrl`（文字列・単数）も後方互換で受理されます |

## 4. SDK の使い方

```html
<script type="module">
  import { createGadget } from "/sdk/gadget-sdk.js";

  const gadget = await createGadget(); // プラットフォームとのハンドシェイク

  // --- ストレージ（permissions: "storage"） ---
  await gadget.storage.set("tasks", [{ title: "資料作成", done: false }]);
  const tasks = await gadget.storage.get("tasks");   // 見えるのは自分のガジェット×自分のユーザーの分だけ
  await gadget.storage.remove("tasks");
  const keys = await gadget.storage.list();

  // --- 通知（permissions: "notify"） ---
  await gadget.notify("タスクを3件登録しました");

  // --- 表示 ---
  await gadget.ui.resize("large");                   // supported に含むサイズのみ
  const theme = await gadget.ui.getTheme();          // "light" | "dark"

  // --- ユーザー情報（permissions: "profile"） ---
  const me = await gadget.user.getProfile();         // { displayName } のみ。IDやメールは渡されません

  // --- BYOK 外部サービス ---
  const key = await gadget.services.getCredential("anthropic-api");
  // 未設定なら null。設定画面への誘導は gadget.services.requestSetup("anthropic-api")
</script>
```

### 制約（重要）

- **できないこと**: プラットフォームのDBへの直接アクセス、他ガジェットのデータ参照、ユーザーのログイントークン取得、宣言外ドメインへのfetch、`window.top` の操作、ポップアップ
- ストレージは 1ガジェット×1ユーザーあたり合計 **1MB** まで。key は128文字まで、value はJSONシリアライズ可能な値
- SDK呼び出しはすべて非同期（Promise）。タイムアウトは10秒

## 5. permissions 一覧（v1）

| 値 | 有効になるAPI | ユーザーへの表示 |
|---|---|---|
| storage | gadget.storage.* | 「このガジェット専用の保存領域を使用します」 |
| notify | gadget.notify | 「通知を表示することがあります」 |
| profile | gadget.user.getProfile | 「あなたの表示名を取得します」 |
| microphone | （SDK APIなし）承認されたガジェットの iframe にのみブラウザのマイク使用許可が付与される（Web Speech API 等の音声入力用） | 「マイクを使用することがあります（音声入力）」 |

externalServices の宣言は、それ自体が権限承認の対象になります。
ユーザーはインストール時に permissions と externalServices の一覧を見て承認します。
**あとから権限を追加した場合、既存ユーザーには再承認が求められます。**

## 6. 公開までの流れ

1. `gadgets/自分のID/` で開発し、PRを作成（初回はCLA同意が必要です）
2. CIが自動チェック: マニフェスト検証 / 宣言外API呼び出しの静的検査 / ビルド成功
3. adminが審査。観点は次の通り:
   - 宣言と実装の一致（permissions・externalServices）
   - 秘密情報のハードコードがないこと
   - 説明文とdescriptionが実態と一致していること
4. 承認されるとカタログに公開され、各ユーザーが任意にインストールできます
5. 更新も同じ流れ（versionを上げてPR）

**緊急停止**: 公開後に問題が見つかった場合、adminはガジェットを即時停止できます。停止理由は作者に通知されます。

## 7. よくある質問

**Q. スマホ対応は必要？**
A. はい。ガジェットはスマホでも表示されます。`size.default` の枠内でレスポンシブに作ってください。雛形にビューポート設定が入っています。

**Q. AIにコードを書かせてもいい？**
A. 推奨します。この文書と `gadgets/_template/` をAIに読ませるのが早道です。ただし審査基準は人間が書いた場合と同じです。

**Q. Google Drive 全体にアクセスしたい**
A. v1では対応しません（プラットフォームの外部連携ポリシー）。ユーザーが選んだファイル単位のアクセス（drive.file）は将来対応予定です。当面はBYOKで実現できる範囲を検討してください。

**Q. ガジェット同士でデータをやり取りしたい**
A. v1では不可です。要望が多ければv2で共有ストレージAPIを検討します。

## 8. 変更履歴

- **v1.1（2026-07-02）**: externalServices の `baseUrl`（単数）を `baseUrls`（配列）に変更（旧形式も後方互換で受理）。permissions に `microphone` を追加
- v1.0: 初版
