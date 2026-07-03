# setup-wizard — メンバー向けセットアップウィザード

勉強会メンバーが「環境準備 → GitHub 連携 → Fork/clone → ガジェット雛形作成 →
開発サーバ起動」までを、6画面の「次へ」で進められるデスクトップアプリ（Electron、
Windows/Mac 対応・日本語UI）。GitHub Releases で配布します。

## 画面フロー

1. ようこそ（概要・所要時間 約15分）
2. 環境診断（git / Node.js v20+ を検出。無ければ公式ダウンロードページへ誘導 → 再診断）
3. GitHub 連携（Device Flow。未保有者には github.com/signup を先に案内）
4. 長屋に入る（Fork → clone → npm install。進捗ログ表示・clone済みフォルダ指定も可）
5. 部屋を建てる（ガジェットIDをリアルタイム検証 → _template コピー → manifest 書き換え）
6. 完成（`npm run dev:gadget <ID>` を起動しブラウザを開く。AIへの最初の指示文コピー付き）

各画面に「手動で続行する場合」の手順を常設。ウィザードが途中で使えなくなっても
手作業に引き継げます。

## セキュリティ

- GitHub のアクセストークンは**メインプロセスのメモリのみ**に保持（ファイル・
  キーチェーンへの保存なし。アプリを閉じれば消え、次回は再認証）
- clone は認証なしの公開 https URL で行うため、トークンが `.git/config` に
  残ることもありません（**前提: リポジトリが Public であること**）
- レンダラーは contextIsolation 有効。外部URLは https のみ `shell.openExternal`

## 配布担当者（向井）の事前設定

1. **GitHub OAuth App の作成**（Device Flow 用。1回だけ）
   - github.com → Settings → Developer settings → OAuth Apps → New OAuth App
   - Application name: 任意（例: NAGAYA-BASE Setup） / Homepage・Callback URL: リポジトリURLでよい
   - 作成後、**「Enable Device Flow」にチェック**を入れて保存
   - 表示される **Client ID** を `tools/setup-wizard/config.json` の `githubClientId` に記入
     （Client ID は公開情報なのでコミットしてOK。**Client Secret は使わない・書かない**）
2. リポジトリを Public にする（clone を認証なしで行うため）

## 開発・ビルド

```bash
npm install                             # ルートで（workspaces）
npm start -w setup-wizard               # 開発起動
npm run dist -w setup-wizard            # Windows ポータブル exe（単一ファイル・推奨）
npm run dist:installer -w setup-wizard  # （任意）NSIS インストーラー形式
npm run dist:mac -w setup-wizard        # Mac の dmg（Mac 上でのみ実行可）
```

生成物: `tools/setup-wizard/dist/NagayaBaseSetup-<version>-portable.exe`
（ダブルクリックで直接起動。インストール不要。**config.json は exe に内蔵されるため、
`githubClientId` を記入してからビルドすること**）

生成物を GitHub Releases にアップロードして配布します。

## 未署名バイナリの警告への対処（配布ページに記載すること）

コード署名をしていないため、初回起動時に警告が出ます。

- **Windows (SmartScreen)**: 「WindowsによってPCが保護されました」→
  **「詳細情報」→「実行」** をクリック
- **Mac (Gatekeeper)**: 初回はアプリを**右クリック →「開く」→「開く」**
  （それでも開けない場合はターミナルで `xattr -cr /Applications/<アプリ名>.app`）

署名（Windows: コード署名証明書 / Mac: Apple Developer Program）は
配布規模が大きくなった段階で検討します。

## 検証手順

向井の実機（Windows）での検証手順は [TESTING.md](./TESTING.md) を参照。
