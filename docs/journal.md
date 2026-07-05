# journal.md — 開発ジャーナル

日々の変更・決定・未決事項の記録。新しい日付を上に追記する。

## 2026-07-05（ウィザードの Mac 版をクラウド(CI)でビルド — 次の試用者=井上さんがMac）

向井「次の試用者(井上さん)がMac。クラウド上でMac用ビルドできるでしょ」。→ その通り。GitHub Actions の
macOS ランナーで .dmg を作る。Mac 実機不要。

- `.github/workflows/build-wizard.yml`: matrix(windows-latest→.exe / macos-latest→.dmg)。
  タグ push（v*）or 手動実行(tag指定)。`npm ci`→`npm run dist|dist:mac --workspace setup-wizard`→
  `gh release upload <tag> ... --clobber`（版なし固定名なので入手URLは不変）。permissions: contents:write
- Mac 設定（package.json build.mac）: `dmg`/`arch:universal`（Intel+Apple Silicon 両対応の単一dmg）/
  `artifactName: NagayaBaseSetup-mac.dmg`/`identity:null`（未署名＝Gatekeeper警告は出るが実機不要でビルド可）
- 入手UI: `WizardDownload.tsx` を OS判定式に（Windows/Mac を自動で主ボタン化＋他OSリンク）。
  警告注記も Windows(SmartScreen)＋Mac(Gatekeeper: 右クリック→開く)の両対応に。config に wizardDownloadUrlMac 追加
- 実行: main へ push 後 `gh workflow run build-wizard.yml -f tag=v0.1.0`。CI成功でdmgがリリースに付く
- 注意: Mac も未署名（Apple Developer 証明書なし）→ 初回は「右クリック→開く」。署名/公証は要 Apple 有料アカ

## 2026-07-05（ウィザード入手を直接DL化＋SmartScreen注意をボタン下に）

向井「入手ボタンがリリースページに飛ぶのは無意味。押したら直接ダウンロードでよい。警告の文言は
ボタンの下に。Macは？（環境非依存の話だったのでは）」を反映。

- 直接DL: `artifactName` を版なし `NagayaBaseSetup-portable.exe` に変更→再ビルド→リリース資産を差し替え。
  `config.ts` に `wizardDownloadUrl = ${repoUrl}/releases/latest/download/NagayaBaseSetup-portable.exe`
  （常に最新リリースの資産・302で解決を確認）。工房と入口のボタンを `<a download>` 直DLに
- SmartScreen注意: 共通コンポーネント `WizardDownload.tsx`（`WizardDownloadButton`／`WizardWarningNote`）を
  新設し、工房(WorkshopView)と入口(CraftsmanGuide)のボタン直下に常設。リリースページには依存しない
- Mac について（回答）: ウィザードは Electron のデスクトップアプリ＝OSごとにビルドが必要。"環境非依存"は
  「利用者の開発環境の差を吸収して雛形まで導く」意味で、単一バイナリが全OSで動く意ではない。Mac版(.dmg)は
  Mac実機でのビルド/署名が要るため保留（backlog 既知）。当面 Windows のみと明記。全員Windowsなら不要

## 2026-07-05（セットアップウィザードを初リリース v0.1.0 — 空のリリースページ解消）

向井「工房の『セットアップウィザードを入手』を押すと空のリリースページ（There aren't any releases here）」。
原因: 入手ボタンは `${repoUrl}/releases` を開くが、リリース未公開だった（ウィザードはソースのみ）。
向井の判断で今すぐ Windows 版をビルドして公開。

- ビルド: `tools/setup-wizard` を `npm run dist`（electron-builder --win portable）。
  詰まり: electron が workspace ルートに hoist され版が範囲(^43)で解決できず失敗 → build 設定に
  `electronVersion: "43.0.0"` を明示して解決。既存の dist（7/4 01:11）は renderer 改修・ナビ修正・
  watercolor・electron更新より前で陳腐化していたため作り直し
- 公開: GitHub Release `v0.1.0` に `NagayaBaseSetup-0.1.0-portable.exe`（約93MB）を添付。repo は Public のため
  members がDL可。exe は .gitignore 済み（リポジトリには入れない・リリース添付のみ）
- 注意（未解決・任意）: 未署名のため初回に Windows SmartScreen 警告が出る（「詳細情報」→「実行」）。
  実機での通しE2Eは TESTING.md に沿って要実施。各画面に手動続行の逃げ道あり

## 2026-07-05（案内AIの挨拶＋PWAの更新を確実化〔古いキャッシュ対策〕）

向井「ログインしたら案内AIが声かけを」「reload/ログインで最新がロードされるべき（今は古い状態が開く）」を反映。

- **挨拶（第一声）**: 各ペルソナに `greeting` を追加。会話が空のとき、すがたの声かけを
  表示（表示のみ・生成コストなし）。例: 女将「おや、よく来たね。まあ座って…」
- **PWA更新の確実化**（本題の"古い状態が開く"）:
  - 原因: SW/シェルの HTTP キャッシュ。`sw.js` がブラウザキャッシュから返ると新SWを検出できず
    古いシェルのまま固まる。※ガジェット追加などの**DBデータは Supabase 直読みで常に最新**
    （SWは同一オリジンのビルド成果物だけを precache。DB応答はキャッシュしない）。古くなるのは
    プラットフォーム本体（UI/JS）だけ
  - `public/_headers`: `sw.js`/`registerSW.js`/`index.html`/`/`/`manifest.webmanifest` に
    `Cache-Control: no-cache`（毎回サーバー再確認。ハッシュ付き /assets/* は据え置きで良い）
  - 登録を自前化（`injectRegister:null` → main.tsx で `registerSW({immediate,onRegisteredSW})`）。
    起動直後・タブ復帰時・60秒ごとに `registration.update()`。`autoUpdate`＋skipWaiting＋clientsClaim で
    新SW検出→即有効化→最新へ。`vite-env.d.ts` に `vite-plugin-pwa/client` 参照を追加
  - build に registerSW.js は生成されず、登録は本体バンドルに同梱（index.html は本体JSのみ参照）
- 検証: build＋56テスト緑、dev 起動・console エラー無し。実際のSW更新挙動は本番デプロイで要確認

## 2026-07-05（案内AIの既定オープン・全幅バナー・縮小表示・AI設定モデルをプルダウン化）

向井の4点の指摘を反映:
- **AI設定済みなら案内AIを既定で開く**: aiReady が true になった1回だけ `openPanel()`。
  ユーザーが閉じたらそのまま（ボタンだけの状態にしない）
- **ペルソナ画像を窓の全幅表示**: `mx-auto object-contain`（左右に隙間）→ 幅100%コンテナ＋
  `aspect-ratio 2/1`＋`object-cover`。窓を広げると縦横比を保って拡大
- **縮小⇔標準ボタン**（⚙設定の左）: `compact` を AssistantPrefs に追加。縮小時は
  `aspect-ratio 5/1`＋`object-position center 17%` で中央帯（上1割・下半分を削った高さ4割）だけ表示
- **AI設定のモデルを文字入力→プルダウン**: `aiSettings.ts` に `AI_MODELS`（ALLOWED_MODELS と同期・
  fast/smart ラベル付き）を追加、AiSettingsPanel の input を select に。tier で自動切替する旨を注記。
  ※fast/smart のモデル切替はサーバー定数（TIER_MODEL）で自動、AI設定の1個は「tier指定が無い時の既定」

## 2026-07-05（案内AIにペルソナ〔見た目＋性格・話し方〕＋基本情報）

向井「naviai の画像10種を案内AIに実装。上に表示、選択可、性格・話し方も設定、
各画像に合った性格をセット、自分の画像も適用可、基本情報も書ける」を実装。

- 画像: `assets/src/naviai` の10枚（下女/丁稚/女中/書生/メイド/執事/秘書/番頭/女将/旦那）を
  webp 化（各13〜18KB）→ `platform/public/img/naviai/<id>.webp`。案内AIの窓の上にバナー表示
  （`object-contain`＋`clamp(72px,20vh,132px)`で窓幅に追従）
- `host/persona.ts`: 10ペルソナ定義（id/label/img/blurb/性格プリセット）＋ `AssistantPrefs`
  （personaId/customImage/userInfo/personality）を端末ローカル保存。各すがたに合った
  「性格・話し方」の既定を用意（選択で自動反映）。画像アップロードは canvas で 480px webp 縮小
- GuideAssistant に⚙設定パネル: すがた選択（グリッド）／自分の画像を適用／基本情報（名前・
  呼ばれ方・してほしいこと）／性格・話し方（編集可・標準に戻す）
- 会話ごとに persona を guide 文脈で送信 → `/api/ai` が system に「人となり」「利用者について」を
  注入（各800字制限・正確さは崩さないガード）
- 検証: build＋56テスト緑、10枚とも dev サーバ配信200確認。窓自体は login＋BYOK 前提のため
  実UIの目視は実デプロイで（既定すがた=女中）

## 2026-07-05（案内AIの窓は AI未設定なら出さない）

向井「費用が各自のBYOK負担のままなので、AI設定を入れないと案内AIの窓は開かない設定に」を実装。

- GuideAssistant: マウント時＋画面移動のたび（設定が済むまで）`fetchAiStatus()` を確認し、
  未設定なら💬ボタン含め**何も描画しない**。工房でAI設定→移動で窓が出る（リロード不要）。
  生成が `ai_not_configured` を返した場合も窓ごと隠す。従来の「未設定でも入口だけ表示」分岐は削除
- トレードオフ（記録）: 未設定ユーザーは案内AIの存在に気づけない（発見導線は工房AI設定＋案内所記事）。
  存在告知が要るなら別途一文を検討

## 2026-07-05（非段3の設計を全実装: ADR-011 ツール開放 + #17 tier + #18 記事）

向井「永続記憶未満の設計は全部実装。迷う所は推奨案で、E6まで確認を待たず完遂」を受けて自律実装。

- #17 tier: `gadget.ai.complete({tier:'fast'|'smart'})` → `/api/ai` が `TIER_MODEL[tier][provider]` で解決。
- ADR-011（gadget-spec v1.6 §9）E1〜E4:
  - SDK: `aiTools`／permission `ai-tools`／`gadget.ai.onToolInvoke`／host→gadget の `tool-invoke` RPC
    （createRpcClient を分離し port で RPC応答とツール実行を一本化）
  - host: `createGadgetHost.invokeTool`、`gadgetTools` 登録簿（棚に開いている＋承認済みのみ）、GadgetFrame が登録
  - 案内AI: タグ方式 `nagaya-tool` パーサ（テスト付き）＋エージェント的ループ（read自動・最大3連鎖／act承認ボタン）
  - スケジュール秘書で実証（list_events=read / create_event=act）。version 0.3.0（ai-tools 追加で要再承認）
- #18: 案内所に「学びの3段階」記事（06-manabi.md）→ reindex 済み（21ファイル/68チャンク）
- 自律判断（推奨案）:
  - ツールプロトコルは**タグ方式**（プロバイダの function-calling API 差を回避・段2の実装を再利用）
  - 呼べるのは**今棚に開いているガジェットのみ**（隠しiframeプールを避け「見ている道具を操作」に限定）
  - **E5 streaming は進捗表示で代替し、真のトークンstreamingは繰り延べ**（Functions+iframe配信は大規模インフラで、
    進捗表示があれば体感の主目的は満たせるため。backlog #17 に streaming 残）
- 未検証: 案内AI↔ガジェットの通しE2Eはログイン＋実デプロイ必須（パーサ/型はテスト、build+56テスト緑）

## 2026-07-05（設計メモ: 2軸の独立＋"学びの3段階"カリキュラム）

向井との対話で固めた整理（実装なし・設計記録）:

- **2軸は独立**: 軸A=ガジェット内部AI（gadget.ai・ガジェット→AI）／軸B=案内AIへのツール開放
  （aiTools・AI→ガジェット）。組み合わせ4通り。**非AIガジェットでもツール口を開けば案内AIが操作可能**
  （例: AIゼロの買い物リストが add_item を開放→「牛乳追加して」で案内AIが操作）。
  注意: 案内AIの"判断"は本人BYOK(②)を使う → 非AI操作でも案内AI利用にはBYOK前提（ガジェット側はAIコスト0）。
- **学びの3段階（店子=使う／職人=作る の対称）**: ①非AIガジェット ②AI搭載(BYOK) ③案内AIに操作許可/
  ツール口を設計。難易度・抽象度順で、業界の進化順（アプリ→アプリ+AI→エージェント）とも一致。
  BYOKは②③共通ゲート（②=ガジェットがAI使用／③=案内AIがAI使用）。③はAI搭載と独立の軸なので
  非AIガジェット(①)にも適用可（＝厳密には②の後とは限らないが、教える順は1→2→3が妥当）。
  職人の③=ツール口の設計スキル／店子の③=許可を与える判断スキル。
- 運営はこの3段階をメンバーの段階的カリキュラムにしたい意向 → 案内所に明文化（backlog #18）。

## 2026-07-05（ADR-011 統合アシスタント＝ガジェットのツール開放 — STEP 0 設計ドラフト）

向井と設計対話し方向性合意 → ADR-011 起草＋gadget-spec §9（ドラフト・未実装）。実装は承認後。
- 核: 案内AI1つが、ガジェット宣言のツール（read/act）を横断呼び出し（MCP的。gadget=ツールサーバ）。
  「AI内蔵」ではなく「AIに開ける口の宣言」。opt-in・既定OFF・act承認必須・`gadget.ai`と共存。
- 対話で確認した重要点: ステートレスで成立（会話内のツール実行に永続記憶は不要。横断=記憶ではない。
  段3が要るのはセッション跨ぎの"覚える"だけ）。世間の潮流（MCP/App Intents/Actions）と同型で、
  学びとしても汎用（"ここだけの知識"ではない）。①gadget.ai と ②ツール開放の両方を学べる場に。
- backlog #16 に段階（P2 read最小→P3 act→P4 PC個別/段3統合）。SDK変更は gadget-spec v1.6 で確定。

## 2026-07-05（案内AI 段2 — STEP 0 差分計画＋着手）

ADR-010 段2（文脈追従・操作補助）。記憶はしない（セッション内のみ）。段1を壊さない。

差分計画（サブステップ）:
- 2a 文脈追従の土台【EXT】: クライアントが「今見ている画面」等の最小 context を guide に渡し、
  system プロンプトに「今の状況」を足す（サーバ状態票はDB事実、clientは画面/直近操作を補う）
- 2b 操作補助（承認前提）【NEW】: guide が回答末尾に1つだけ構造化アクションを提案できる
  （```nagaya-action {…}```）。クライアントが安全なものだけ確認ボタン化→押下で実行
  （install / open(view) / help(article) / ai-settings）。**AIは実行しない・必ずユーザー承認**。
  プロバイダ非依存（tool-calling API を使わずタグ方式）。パーサは host/guideActions.ts（テスト付き）
- 2c 伴走（ステップ追跡）【後続】: 連携クレデンシャル保存/インストール等のシステム信号で
  多段手順の進捗を推定し先回り。2a/2b の上に載せる
- KEEP: /api/ai・ai_usage・RAG・段1挙動を壊さない。操作対象はプラットフォームのみ
  （ガジェット内部は操作しない＝ADR-001）。ハードコード禁止・CLAUDE.md DO NOT 厳守

2a+2b+2c すべて実装（build+test 53緑）。2c は連携設定が要る導入済み道具の「設定方法」チップ
（軽量版・トークン浪費なし）。より厳密な進捗追跡（クレデンシャル状態の判定）は残タスク。

## 2026-07-05（案内AI 段1 — サブステップ5 実装。RAG稼働は索引作成待ち）

- migration 20260705030000: pgvector `doc_chunks`（vector(1536)・hnsw cosine）＋
  `match_doc_chunks(query_embedding, match_count)` security definer RPC
- `/api/ai` guide: 直近ユーザー発話をプラットフォームキー（`PLATFORM_EMBEDDING_KEY`・OpenAI）で
  埋め込み→ `match_doc_chunks` で近傍チャンク取得→ system に添えて根拠づけ生成。埋め込みは
  `ai_usage`(key_owner=platform, purpose=embed) 記録。**RAGは任意**: キー無/該当無なら RAGなしで回答
- `npm run reindex`（tools/reindex）: .md をチャンク化→埋め込み→ doc_chunks へ upsert
  （help/docs/README/各ガジェットSETUP+README。dev内部ログは除外）
- 決定: 埋め込みは段1では**プラットフォーム1本のキーで全部**（職人別按分は段2/backlog#15）
- 検証: pgvector/pgvector:pg16 で 18 migrations 適用＋match RPC 動作、build+test 47 緑
- 稼働までの残: (1) migration 適用 (2) .env に SUPABASE_URL/service key 追加 (3) `npm run reindex`
  (4) Cloudflare の `PLATFORM_EMBEDDING_KEY` で本番 guide が埋め込み可能に

## 2026-07-05（案内AI 段1 — サブステップ1〜4 実装。5=RAGはキー準備待ち）

向井の指示「1〜4を止まらず完了、判断は推奨案で、後で報告」に基づき自律実装。5（RAG）は
埋め込みキー準備が前提のため未着手（要件を別途提示）。

実装（migrations 20260705010000/020000。要・手動適用）:
- 使用量/コスト: ai_usage に purpose/key_owner/est_cost_usd 追加。ai.ts が呼び出しごとに概算コスト
  記録。AI設定に「今月の概算費用」、大家の間に「AI利用（運営分/BYOF分）」集計（ai_usage_summary RPC）
- ADR-010（アシスタントと記憶・段1/2/3）起草。backlog #12〜15 追加
- 状態票: profiles.last_visit_at/visit_count ＋ record_visit() RPC。ログイン時に記録。
  guide Function が毎回サーバー側で状態票を組む
- 案内AI窓: /api/ai に guide アクション（状態票＋systemプロンプト＋既存BYOK complete）。
  GuideAssistant = 下部常駐の単一窓（スマホ最優先・会話はセッション内のみ）。**AIは任意**

自律判断（推奨案で進めた点）:
- コスト概算: 文字数÷4≒トークン、モデル別の粗い単価表（未知モデルは既定）。円換算は固定160円/$の概算表記
- 案内AI窓は signed-in 時のみ・オーバーレイ表示中は隠す。未設定時は入口のみ（工房のAI設定へ誘導）
- guide の system は長屋の語彙＋状態票のみ（RAGなし版）。詳細誘導は「案内所」を案内
- 検証: 17 migrations Docker適用OK、record_visit/ai_usage_summary 挙動確認、build+test 47 緑

## 2026-07-05（案内AI 段1 — STEP 0 差分計画・調査報告）

指示書「08_案内AI_Code指示書.md」の STEP 0。既存を調査し、差分計画を記録（実装は承認後）。

### 調査で確認した既存資産（作り直さない）
- `functions/api/ai.ts`: BYOK プロキシ（anthropic/openai/google の complete/status/set/delete）。
  キーはサーバー側でのみ復号。→ 案内AIの**生成**はこれを再利用（新しいAI口は作らない）
- `ai_usage`（20260704090000）: user_id/provider/model/input_chars/output_chars/created_at
  ＋レート制限。→ 使用量可視化は**列追加で拡張**（新テーブル禁止）
- 情報系 View（AnnouncementsView/CalendarView/HelpView/ProgressView/InfoSlot）: 触らない
- `HelpView` は `platform/src/content/help/*.md`（01〜05）を表示。→ **RAG最重要対象**
- `FloatingWindow`: 棚の複数窓。→ 案内AI窓は別物（下部常駐の単一窓）として整合
- `AiSettingsPanel`（旧 AiSettingsDialog を分離済み・工房に inline）: 有効化導線はここと整合
- pgvector/embeddings/reindex は**未存在**（新規）。npm scripts は dev/build/test/db:migrate のみ

### 差分計画（新規=NEW / 拡張=EXT / 不可侵=KEEP）
1. RAG基盤【NEW】: migration で `vector` 拡張 + `doc_chunks`(source_path, chunk_index,
   content, embedding vector, key_owner, gadget_id?, updated_at) + `match_doc_chunks` RPC。
   RAG対象は .md のみ（help/*.md 最重要、docs・README・各 gadgets/*/SETUP.md）
2. reindex【NEW】: `npm run reindex`（Node）で .md をチャンク化→埋め込み→upsert。手動運用
3. 状態票【NEW/EXT】: profiles に last_visit_at/visit_count（最小）。対話時に installations/
   role/来訪/AI設定有無/公開有無 をサーバーで集めシステムプロンプトへ（AIは覚えない）
4. 案内AI本体【NEW】: 下部常駐の単一AI窓（スマホ最優先）＋ Function（RAG検索→状態票→
   既存 complete で生成）。**AIは任意**：未設定なら入口のみ表示、長屋は完全機能
5. 使用量可視化【EXT】: ai_usage に purpose/key_owner/est_cost 追加。ユーザー=今月概算費用、
   admin=運営分（共通埋め込み＋キーなし職人代行）集計ビュー
6. ADR-010【NEW】＋ backlog（段2/段3・CI自動reindex・共通キーの協会引き取り）

### 実装前に判断が要る点（報告）
- **クエリ埋め込みキー問題（最重要）**: RAG検索前にユーザーの質問文を埋め込む必要があるが、
  Anthropic(Claude) には埋め込みAPIが無い。→ 生成BYOKとは別に、**プラットフォーム保有の
  埋め込みキー（OpenAI text-embedding-3-small 等）を1本**用意し、索引・クエリ両方で使うのが現実解。
  新シークレット＋わずかなコスト（ai_usage で key_owner='platform', purpose='embed' 記録）
- pgvector: Supabase で `create extension vector` を有効化する必要（手動適用時に実行）
- 規模が大きいため段1を5サブステップに分割して順次PR/確認を推奨（上記1〜6の順）
- KEEP: /api/ai・ai_usage の破壊変更なし、情報系/棚UI不変、CLAUDE.md DO NOT厳守、ハードコード禁止

## 2026-07-04（ナビゲーションボタンの配置を修正）

- 向井の指摘（左→右へ進むのに「次へ」が左下で違和感）を反映:
  - 店子チュートリアル: フッターを3列（戻る=左下 / スキップ=中央下・小 / 次へ=右下・大・太字）に。
    step2/3 の「道具市を開く」「欲しい道具を提案する」は本文中のCTAへ移動、戻るで前段に戻れる
  - セットアップウィザード: `.nav` の `flex-direction: row-reverse`（次へが左になっていた原因）を
    除去。戻る=左端・次へ=右端で大きく。※Electron のため見た目は実機で要目視

## 2026-07-04（gadget.ai を複数プロバイダ対応 — backlog #7 完了）

- `functions/api/ai.ts` を anthropic / openai / google に対応。gadget.ai.complete の
  {system, messages, maxTokens} を各社形式（Anthropic messages / OpenAI chat.completions /
  Gemini generateContent）へ変換。保管設定に provider を追加（既定モデルは各社別）
- AI設定ダイアログ: 提供元セレクト＋趣旨説明＋案内所リンク。案内所に「AIの使い方」ページ
  （05-ai.md: 趣旨、対応表、Anthropic/OpenAI/Google のキー取得手順、設定方法、注意）を追加。
  ダイアログのリンクから該当ページへ deep-link
- device フォールバック（ローカル開発・無ログイン）は anthropic/google をブラウザ直呼び対応、
  openai は CORS 上サーバー経由（本番 /api/ai）が必要な旨を明示。本番は全社サーバー代理実行
- 全47テスト green。新設定は不要（既存の Pages Secret を再利用）

## 2026-07-04（入居者情報・大家メニュー・道具GUI編集 — フェーズ2〜4）

- **フェーズ2 入居者情報・部屋番号・入居者一覧**（`20260704040000_resident_profiles.sql`）:
  profiles に room_no（入居順の連番・guestには付けない・BEFOREトリガーで採番+既存backfill）、
  avatar / bio / links / visibility を追加。本人が更新できる列を拡張（role/room_no は不可）。
  各項目の公開/非公開は visibility(jsonb)、他者への表示は `list_residents()`（security definer）が
  visibility 適用済みで返す（非公開項目はDBから出さない）。プロフィール編集・入居者一覧の画面と
  「入居者」タブ、ヘッダーの名前クリックで自分の部屋へ。アイコン画像はクライアント圧縮
  data-URL（`lib/imageCompress.ts`、Storage不使用）。Docker で採番・visibility を実測
- **フェーズ3 大家の間（ロール付与）**: `functions/api/admin.ts`（service_role、呼び出し元が
  admin かを検証 → ロール変更を PATCH ＋ audit_logs 記録。自分自身は変更不可でロックアウト防止）。
  admin だけに「大家の間」タブ。クライアントに role 列の更新権限は与えないまま（ADR-003）
- **フェーズ4 道具のGUI編集**（`20260704050000_gadget_presentation.sql`）: 道具市カードの
  表示名・説明・カバー画像を manifest を触らず DB で上書き。編集は owner か admin（RLS）。
  カタログ表示時にマージ。画像は圧縮 data-URL（≤150KB）。gadget_presentation テーブルが
  無くてもカタログは壊れない（best-effort）
- 全10マイグレーション Docker 検証。全47テスト green。ゲスト入場・ナビ・admin タブ非表示を実機確認
- **向井: 追加3マイグレーション（030000 merge / 040000 residents / 050000 presentation）を
  SQL Editor で適用要**。admin API は既存の Pages Secret（service_role/url）を再利用（新設定不要）

## 2026-07-04（入場・ロールモデルの刷新 — フェーズ1＋ロール統合）

- **入場モデル**（決定: ゲスト即入場／一般ユーザー、パスワード＋マジックリンク両対応）:
  - `20260704020000_auth_roles.sql`: サインアップ時のトリガーが匿名→`guest` / メール→`user`
    をサーバー側で付与（自己昇格の穴なし）。developer/admin は admin のみ
  - LoginView 刷新: 軒先（匿名で即入場・閲覧のみ）/ 入居（メール: パスワード or リンク、登録/ログイン切替）。
    useAuth に signInAsGuest / signInWithPassword / signUpWithPassword を追加。
    ゲストは入口の職人/店子分岐をスキップ
  - Docker でトリガー実測（匿名→guest / メール→user）
- **store子(user)と職人(developer)のロール統合**（決定）:
  - `20260704030000_merge_developer_into_user.sql`: 道具の登録・提出を `developer` →
    `user` に緩和。入居者は user 1ロールで利用も作成・公開も可能。developer は enum に残すが
    今後付与しない。requirements §3 / CLAUDE.md / ADR-003 / frontend-design.md を更新
  - カタログのゲスト向け文言を「入居（一般ユーザー登録）で使えます」に変更
- 全8マイグレーションを Docker で通し検証。全47テスト green
- **向井: Supabase 設定（Anonymous sign-ins 有効化）と auth_roles マイグレーション適用済み。
  merge マイグレーションは要適用**

## 2026-07-04（本番テストのフィードバック反映）

向井の本番テストでの指摘を反映:
- バグ: 長屋の歩みの PostgREST embed 曖昧エラー（gadgets↔profiles が
  installations/gadget_storage 経由でも関係するため）→ 職人名は別クエリで解決。
  ヘッダーのドロップダウン（案内/テーマ）が外クリックで閉じない → useClickOutside 追加
- 案内所の全面平易化: 「道具の作り方」を**AI活用を主軸**に再構成（Claude Code等で
  会話しながら作るのを第一に、手作業は代替として後段。PR/CI/sandbox/PWA を平易に説明）。
  「PR」等の専門用語を注釈化、相談先を「GitHub Issue」→「管理人・ベテラン職人」に変更。
  AIは Anthropic 固定でなく Claude/OpenAI/Google から選べる旨を明記（内蔵AIの複数
  プロバイダ対応は backlog #7）。CONTRIBUTING/CLA/仕様は要約を案内所内に掲載し
  GitHubリンクは「正文（任意）」に降格。「権利のはやわかり」→「権利について」に改称
- Markdownレンダラーにパイプ表対応を追加し、権利の早見表を**表**で表示
- 道具市カードに任意の画像対応（manifest.icon、gadget-spec v1.4）。schedule-secretary に
  `cover.webp` を宣言（画像ファイルの配置は向井待ち。未配置でも onError でカードは崩れない）
- 未処理（向井待ち）: スケジュール秘書のカード画像ファイル配置

## 2026-07-04（情報系レイヤー（一方向）実装完了 — 指示書⑦）

- 5機能を実装（設計原則どおり**双方向機能は一切作らず**、backlog #6 に条件付きで記録）:
  - **回覧板**: admin投稿（タイトル/本文Markdown/重要度）、店子・職人は閲覧のみ
  - **速報！**: gadgets の published 遷移 + gadget_versions.published_at を**DBトリガー
    （security definer）で自動フィード化**。クライアントに INSERT 権限なし。
    gadgets に name 列を追加（フィード文面用）
  - **長屋暦**: admin管理の告知カレンダー（直近リスト+過去5件）
  - **案内所**: `src/content/help/*.md` 4本（はじめて/道具の作り方/FAQ/権利のはやわかり）を
    依存なし軽量Markdownレンダラーで表示。※FAQは「パワポ想定問答」が未入手のため
    CONTRIBUTING/CLA/仕様から構成（スライドと突き合わせ要確認）
  - **長屋の歩み**: フィード+公開済み一覧から自動生成（今月の新着/職人別公開数。煽らないトーン）
- 棚上部の InfoSlot に回覧板最新2件・速報3件・次の予定を差し込み（クリックで各ページへ）。
  ヘッダーは6タブ（棚/道具市/回覧板/長屋暦/案内所/歩み）
- 検証: 全7マイグレーションを Docker で適用し、公開→フィード自動生成をSQLで確認。
  ログインなしモードで案内所全文・他ページのプレースホルダ表示を実機確認。全47テスト green
- 未決（向井の作業）: 本番への2マイグレーション適用（profiles_settings / info_layer、
  SQL Editor）→ admin で回覧板・暦に投稿して一般表示を確認 → ガジェット公開で速報確認

## 2026-07-04（見た目統合・入口・チュートリアル・ウィザード完了 — 指示書④⑤⑥）

- STEP 0: 画像30枚をWebP最適化し `platform/public/img/` へ（背景/KV 1920px・小物512px・
  テクスチャは継ぎ目維持のため原寸WebP=877KB。指示の「そのまま」は重量制約と衝突するため調整）。
  原本は `assets/src/` 退避、`platform/src/assets.ts` にパス定数、変換は `scripts/optimize-assets.mjs`
- **重要発見: アセットのファイル名と中身が広範囲に不一致**（例: happi-coat.png=木目、
  rice-barrel.png=法被、wide-town.png=額縁構図）。全30枚を実物監査し、MANIFEST.md に
  訂正表を追記。コードからの参照は assets.ts の意味キー経由に統一（調査エージェントの
  報告にも誤りがあり、最終判定は全て人手=Claude本体の目視で実施）
- STEP 1: `docs/frontend-design.md`（色6トークン・タイポ・質感・語彙帳）新設、CLAUDE.md に語彙帳
- STEP 2: 入口分岐（職人/店子）。**行動分岐のみでステータス無関係**（2026-07-04決定、
  ロールは admin 付与のまま）。選択は profiles.settings（新マイグレーション、
  authenticated は display_name と settings のみ更新可）。メニュー「案内」から再実行可
- STEP 3: 店子チュートリアル3ステップ（スキップ可・tutorialDone保存）+
  「欲しい道具」Issueフォーム（gadget-request.yml）
- STEP 4: 棚・道具市に世界観適用（和紙地紋・creamパネル・navy見出し・井戸の空状態）。
  棚上部に情報系スロット（InfoSlot）を確保して指示書⑦へ引き継ぎ
- STEP 5: ウィザードに画面別水彩背景を同梱、「最初の道具」画面に**ID自動命名+お題カード**
  （おみくじ/今日の3つ/プロンプト帳/単位変換/白紙→AI指示文に反映）。起動スモーク確認済み
- STEP 6: OGP画像設定（gate-street）、チラシ修正点4件を README に記録
- backlog に「入口体験・チュートリアル・ウィザード世界観」の既存項目は無かったためクローズ対象なし
- 未決: 本番URLでの通し確認（デプロイ後に向井）。profiles.settings マイグレーションの
  本番適用（SQL Editor）

## 2026-07-03（追記: セットアップウィザード新規作成）

- `tools/setup-wizard/`（Electron、Win/Mac・日本語UI）を新規作成し、monorepo の
  workspaces（`tools/*`）に追加。6画面フロー: ようこそ→環境診断→GitHub連携→
  長屋に入る（Fork/clone/npm install）→部屋を建てる（_template コピー+manifest 書換）→完成
- セキュリティ: GitHub トークンは**メインプロセスのメモリのみ**（ファイル保存なし、
  clone は公開https URLで .git/config にも残さない）。contextIsolation 有効・
  renderer に CSP。**前提: リポジトリ Public 化 + OAuth App（Device Flow・Client ID のみ）**
- 各画面に「ここまでの状態」＋「手動で続行する場合」を常設（ウィザードが死んでも手作業へ）
- 配布は GitHub Releases、未署名警告の対処手順は README に記載
- Windows 実機検証手順書 `TESTING.md`（初回ユーザー井上さん=Windows想定を優先）
- 検証: gadget-id/version パーサの単体テスト追加（全47テスト green）。electron 起動で
  ウィンドウ生成・renderer ロードを確認。**GUI 通し操作は TESTING.md に沿って向井の実機で要実施**
- 未決: config.json の githubClientId 記入（OAuth App 作成）、Public 化、実機通し検証、
  Mac ビルド（Mac 実機必要・後回し）

## 2026-07-03（追記: 決定済み事項の記録漏れを補完）

- 開発フローの運用判断（決定済み）: Claude Code の作業は当面 **main への直 push（B案）で続行**し、
  **建立会（メンバー初参加日）をもって全作業を PR 経由（A案）へ移行**する。
  実施トリガー付きで backlog #5 に登録（CLA 導入時に「要決定」とした項目のクローズ）

## 2026-07-03（追記: CLA 自動チェック導入）

- `.github/workflows/cla.yml` を追加（contributor-assistant/github-action v2.6.1、
  CLA Assistant Lite）。対象文書は CLA.md、署名記録は**リポジトリ内**
  `cla-signatures` ブランチの `signatures/cla.json`。bot はallowlistで除外。
  未署名者への依頼コメントは日本語カスタム文（署名フレーズは既定の英文のまま）
- **テストPR（#2）で動作確認済み**:
  1. PR作成 → CLA Assistant が同意依頼コメントを投稿し、チェック `cla-assistant` が fail
  2. 「I have read the CLA Document and I hereby sign the CLA」をコメント
     → チェックが **pass** に変化
  3. `cla-signatures` ブランチの signatures/cla.json に署名記録
     （name: yosuke175 / PR #2 / comment_id / 日時）が保存されたことを確認
  4. テストPRはクローズ（マージなし）、ブランチ削除済み
- 気づき: **main のブランチ保護（PR必須）が有効化されており、admin の直 push は
  "Bypassed rule violations" 警告付きで通る状態**。今後の開発フロー（直push継続 or
  全てPR経由）は要決定

## 2026-07-03（追記: メンバー受け入れ準備）

- **Public化の事前点検（全履歴秘密情報スキャン）: 問題なし**。trufflehog 不在のため
  全ブランチの `git log --all -p`（約18,000行）への正規表現点検で代替。
  sk-ant / JWT(eyJ…) / sb_secret / sb_publishable / AKIA / ghp_ / PRIVATE KEY /
  AIzaSy / SHARED_TOKEN実値 / 汎用 secret・token・apikey 代入 — **全パターン0件**。
  .env 系ファイルのコミット履歴もなし
- ガバナンス文書の改訂（PR: docs/member-onboarding）:
  - requirements.md FR-08 / §8: 勉強会フェーズは**事前審査なし・事後統治**
    （CI機械チェック + インストール時ユーザー承認 + admin緊急停止）、
    B2Bフェーズで署名制へ移行、に改訂
  - gadget-spec.md v1.3: §6 を同方針で簡素化、§2 に `_template` のID規則例外を明文化
  - CONTRIBUTING.md に「権利の早見表」を追加（CLA.md / ADR-006 / LICENSE から構成）
  - PRレビュー反映: スライド9の**行為ベース早見表**（5行・○/△/✕、原文は向井から受領）を
    「まず読む早見表」として権利表の手前に追加。欄外注記（AI書き直しもコピー）と、
    △行から参照する「§6 商用利用の相談（稟議）」の節を新設。
    稟議は「原作者の同意 + 管理者の許諾」の2段に改訂（自分のコードのみなら稟議不要）

## 2026-07-03（追記: backlog #4 実施 — /api/ai 代理実行）

- セキュリティ検収の指摘（平文AIキーがブラウザに返る）を解消:
  - `functions/api/ai.ts` 新設: status / set / delete / complete を提供。
    復号とAnthropic呼び出しは**サーバー側のみ**で行い、クライアントには生成テキストと
    非秘匿メタ情報（registered / model）だけを返す。認証は credentials と同じ
    `requireUserId`（Supabase トークン検証）。model のみの更新は既存キーを
    サーバー内で引き継ぎ（平文がブラウザを経由しない）
  - `/api/credentials` は credential_id `platform-ai` を**全アクション403で拒否**
    （AIキーは /api/ai 専用。get からの除外を包含）
  - 共通処理を `functions/api/_shared.ts` に集約（`_` 始まりはルーティング対象外）
  - クライアント: `gadgetHost.completeWithPlatformAi` はログイン時 `/api/ai` 経由に変更。
    AI設定ダイアログはキーを表示しない（登録済み表示+変更時のみ入力）。
    未ログイン/ローカル dev は従来の端末内直呼びフォールバック（挙動不変）
- これで AI キーの平文が存在する場所は「ユーザーの入力欄（登録の瞬間）」と
  「Pages Function 内」のみ。ADR-008 ゲートウェイの残りは利用量記録・レート制限・
  モデル許可リスト（backlog #3）

## 2026-07-03（追記: ADR-005 実装のセキュリティ検収）

5観点の検収結果。コード参照つき。

1. **暗号鍵の置き場所 — 合格**。AES鍵（CREDENTIALS_ENCRYPTION_KEY）の参照は
   `functions/api/credentials.ts` の `env.CREDENTIALS_ENCRYPTION_KEY` のみ。リポジトリ内の
   文字列ヒットは同ファイルと手順文書（README/journal）だけで、鍵の値はどこにもない。
   VITE_ プレフィックスでないため Vite のクライアント埋め込み対象外
   （`platform/.env` は VITE_APP_NAME / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY のみ）。
   ビルド成果物 `platform/dist/assets/index-*.js` に該当文字列なしを実測確認。
   Supabase に保存されるのは ciphertext と iv のみ（鍵は保存しない）
2. **平文キーの到達範囲 — 要改善（唯一の指摘）**。`/api/credentials` の `get` は復号済み
   平文を `{ value }` でクライアント（`platform/src/host/credentialsApi.ts`）に返す。
   gadget.ai は Function の代理実行では**なく**、`platform/src/host/gadgetHost.ts` の
   `completeWithPlatformAi()` がブラウザから Anthropic を直接呼ぶ。iframe には渡らないが、
   **platform オリジンの XSS 一撃で窃取できる距離**にある。評価: AI キーは本来クライアントに
   返す必要がないため、`/api/ai`（Function 代理実行）への前倒し移行を推奨（backlog #4）。
   GAS 等の BYOK はガジェット実行コンテキストへ渡す契約（gadget-spec の getCredential、
   ADR-005 の「受け渡し時のみ」）のため現状が仕様どおり
3. **復号APIの認証 — 合格（Supabase Auth）**。`functions/api/credentials.ts` の
   `requireUserId()` が Authorization: Bearer のアクセストークンを
   `GET {SUPABASE_URL}/auth/v1/user` で検証し、**検証済みの user.id** を行キーに使う
   （リクエストボディ由来の ID は使わない）。トークン無効は 401。本人への紐づけは
   Supabase ログインセッションそのもの。Cookie 認証でないため CSRF 不成立。
   レート制限は未実装（ゲートウェイ移行時、backlog #3）
4. **Supabase側の防御 — 合格**。`20260703010000_user_credentials.sql`: RLS 有効かつ
   **ポリシーゼロ**（クライアントロールはデフォルト拒否）、grant は service_role のみ。
   anon での SELECT が "permission denied" になることを実測確認。service_role キーは
   platform/src・クライアントバンドルに文字列ヒットなし（DO NOT 1 遵守）。存在場所は
   Pages の Secret のみ。DB 単独漏洩でも中身は AES-GCM 暗号文（鍵は Cloudflare 側）
5. **GASクレデンシャル — 移行済み**。`gadgetHost.ts` の `credentialStore` は
   `gadget:<gadgetId>:<serviceId>` の credential_id で同じ `/api/credentials` に保存
   （AI設定は `platform-ai`）。schedule-secretary の GAS URL+合言葉も対象。
   未ログイン・ローカル開発時は localStorage フォールバック（設計どおり）

## 2026-07-03（追記: 文書の整合性メンテナンス）

- 本番でクレデンシャル暗号化保管の稼働を確認（/api/credentials が 204、
  user_credentials テーブル適用済み・匿名アクセス遮断を外形確認）
- ADR-007（GAS橋方式）/ ADR-008（gadget.ai 単一の口 + AIゲートウェイ）を
  architecture.md に起草（backlog #2 完了・#3 は実装のみ残）
- CLAUDE.md の構成図を実態に合わせ修正（Pages Functions はリポジトリ直下 `functions/`）
- requirements.md §4.2 に「AI による文章生成」を追加

## 2026-07-03（追記: クレデンシャルのサーバー側暗号化保管）

### 変更

- `functions/api/credentials.ts`（Pages Function）を新設: Supabase トークン検証 →
  AES-GCM（鍵は Pages Secret、AAD=user:credential でスワップ防止）→ `user_credentials`
  テーブルへ service_role で保存。クライアントは復号済みの値のみ受け取る（ADR-005 準拠）
- マイグレーション `20260703010000_user_credentials.sql`: RLS有効・ポリシーなし
  （クライアントからは一切読めない。アクセスは Function 経由のみ）
- AI設定・BYOK クレデンシャルは「**ログイン + Function 稼働ならアカウント保存（全端末共有）**、
  それ以外は従来どおり端末内保存」に自動フォールバック。AI設定ダイアログに保存先を表示

### 決定

- Pages Functions は Cloudflare の仕様上リポジトリ直下 `functions/` に配置
  （CLAUDE.md 構成図の `platform/functions/` と差異 → 文書側の更新は要判断）

### 未決（このイテレーション分）

- Cloudflare Pages への Secret 設定（SUPABASE_SERVICE_ROLE_KEY / CREDENTIALS_ENCRYPTION_KEY）
  と `user_credentials` マイグレーション適用 → 向井の作業待ち。未設定の間は端末保存で動作
- 鍵ローテーション手順の文書化

## 2026-07-03

### 変更

- **gadget.ai API 新設**（gadget-spec.md を v1.2 に更新）
  - 新権限 `ai` を追加。SDK に `gadget.ai.complete({ system, messages, maxTokens })`
  - 実装はホスト側 RPC: **API キーは iframe に一切渡らず**、platform がユーザー登録済みキーで
    Anthropic Messages API を呼び、テキストのみ返す（ADR-001 準拠）
  - キーはプラットフォーム設定に1つ（ヘッダー「AI設定」から登録。`platform-ai-settings`、
    gadget-credential とは別キー空間の localStorage モック、TODO(ADR-005) 記載）
  - モデルは設定値（既定 `claude-haiku-4-5`）。`ai` 呼び出しのみタイムアウト30秒。
    maxTokens はホスト側で 2000 に制限
- **schedule-secretary v0.2**: 「AIに相談」フロー（自由文/音声 → 直近7日の予定+個人ルールを
  添えて AI に依頼 → 挿入案を最大3件・理由つきカード表示 → 「この案で登録」で GAS create）。
  却下・再提案あり。JSON パースは頑健化（コードフェンス除去→失敗時1回再試行→エラー）。
  「個人ルール」自由記述欄を追加（gadget.storage 保存）
- テーマ機能（アクセント色のプリセット+自由選択、端末ごと保存）と30日分の予定取得（GAS の
  DAYS_TO_LIST=30。**各ユーザーの Apps Script 貼り直しが必要**）
- テスト 41 件（ai 権限許否 / キー未登録 / リクエスト検証 / レスポンス整形 / APIエラー等を追加）

### 決定

- ガジェットに見せる AI の口は `gadget.ai` のみに限定。裏側は将来 Workers の AI ゲートウェイ
  （ADR-008 候補、backlog #3）に差し替える前提。per-gadget の Anthropic BYOK 方式は不採用
- 5段階記憶+チャット常駐型の AI 秘書（foxgod-app 移植）は**保留**。試作は `wip/ai-secretary`
  ブランチに退避（v0.3 候補）

### 未決

- AI キー・BYOK クレデンシャルの暗号化保管（ADR-005 本実装、backlog #1）
- テーマ・AI設定のユーザー間同期（profiles.settings カラム追加のマイグレーション）
- 承認記録（granted_permissions）の installations テーブルへの移行
- 本番（pages.dev）でのマジックリンク動作確認（Supabase の Site URL 設定）
- ADR-007（GAS橋方式）/ ADR-008（AIゲートウェイ）の起草

## 2026-07-02

- Phase 1 scaffold 一式（SDK ハンドシェイク/storage、_template、platform ダッシュボード、
  Cloudflare Pages 対応、externalServices/BYOK、承認UI、ガジェット別CSP、カタログ、
  初期スキーマ+RLS、マジックリンク認証）。詳細は git log 参照
