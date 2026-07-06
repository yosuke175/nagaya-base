# journal.md — 開発ジャーナル

日々の変更・決定・未決事項の記録。新しい日付を上に追記する。

## 2026-07-06（ドラッグ確定時の一瞬のズレを修正＝window.innerWidth → clientWidth に統一）

向井「リサイズのガタつきは無くなったが、ガジェットを動かしてマウスを離すと一瞬ブルッとズレる（案内AIは平気）」。
ブラウザで実測して原因を特定:
- 縦スクロールバーが出ている状態では、`window.innerWidth`（スクロールバー分を**含む**）と、CSSの
  `calc(50% + Npx)` が実際に解決する基準幅（スクロールバー分を**除いた** `document.documentElement.clientWidth`）
  が食い違う（実測で 1200 vs 1185、差15px＝スクロールバー幅）。ドラッグ中は前者(window.innerWidth)で
  絶対座標を計算していたため、ドラッグ確定でCSS計算（後者基準）に戻った瞬間、その差の半分（7.5px）だけ
  瞬間的にずれて見えていた。
- 検証: `position:fixed`（案内AI）・`position:absolute`（ガジェット）とも、実は**両方**このズレの対象と判明
  （スクロールバーの有無に依存するため、向井が試したタイミングでは案内AI側はたまたま出なかっただけ）。
- 修正: 位置計算に使う「ビューポート幅」を全箇所で `document.documentElement.clientWidth` に統一
  （`useViewportWidth` フックに `currentViewportWidth()` を追加、`FloatingWindow`/`GuideAssistant` の
  ドラッグ開始・移動範囲クランプ・ドラッグ確定のすべてで使用。`gadgetLayout.ts` の後方互換ラッパー
  `loadLayouts`/`saveLayout` の既定値も同様に変更）。これでJSの計算根拠とCSSの解決結果が常に一致する。
- 検証: build＋78テスト緑。スクロールバーを強制的に出した状態で、JS側の新しい計算(clientWidth基準)と
  実際のCSS解決結果が完全一致（792.5=792.5）することをブラウザ上で実測確認。

## 2026-07-06（フローティング窓の静止時位置を CSS calc() 化＝リサイズ中のガタつきを根絶）

前回「棚・案内AIを同一経路に統一」してもなお、向井「両方ともブルブル震える」との報告。再診断:
経路を揃えても、**JSがresize信号を受けてから位置を計算し直す方式そのものが、ブラウザのネイティブな
リサイズより必ず一拍遅れる**ため、両方とも同じ頻度でガタついて見えていた（統一で「悪い方に揃った」）。

- **静止時（ドラッグ操作していない間）の位置決めから JS を完全に排除**。`FloatingWindow`／
  `GuideAssistant` とも、position は常に `left: calc(50% + ${cx}px)`（CSSのネイティブ計算）で描画。
  ブラウザの resize は JS を介さずレイアウトエンジンが直接追従するため、原理上ガタつきが起こり得ない
  （壁紙の `background-position: center` と同じ理屈）。
- ドラッグ／リサイズ操作の**最中だけ** JS の絶対座標（`dragLocal` state）を使い、ポインタ移動に
  追従。ドラッグ終了時に `centerFromRect` で中央基準へ変換して確定・保存し、`dragLocal` を解除して
  再び CSS calc() 描画に戻る。
- `FloatingWindow` の props を `rect: WinRect`（絶対）→ `rect: CenterRect`（中央基準）に変更、
  `onCommit` も `CenterRect` を渡すように簡素化。`App.tsx` の `rectFor`/`commit` も追随。
- 検証: build＋78テスト緑。ブラウザ実行で `calc(50% + 200px)` が 2000px/1200px の両方で正しい絶対値
  （1200px/800px）にネイティブ解決されることを確認（JS再実行なし）。ログインが必要な実際のガジェット窓・
  案内AI窓でのリサイズ体感は要実機確認だが、原理的にJSラグが解消されているため改善するはず。

## 2026-07-06（壁紙タイルを上端中央起点に／リサイズ時のガタつき差を解消し棚・案内AIを同一経路に統一）

- **壁紙**: `.nb-washi` に `background-position: top center` を追加。既定は左上角起点でタイルされて
  いたのを、他の中央基準配置（部屋帯・フローティング窓）と揃えて上端中央から左右対称にタイル。
- **リサイズ時の動きの差を解消**（向井「案内AIは動かず、ガジェットはブルブル震えながらズレる」）:
  原因は経路の違い。案内AIは resize イベント内で直接 x を補正する1段の計算だったのに対し、ガジェットは
  `deskWidth` state 変化 → 別の useEffect が発火して layouts を読み直す、という2段構え（幅変化の描画→
  一拍遅れて位置が補正される）で、その「まず古い位置で描画→すぐ後で正しい位置に飛ぶ」の繰り返しが
  ブレて見えていた。
  - 新設 `host/useViewportWidth.ts`: ResizeObserver（documentElement監視）でビューポート幅を追跡する
    共有フック。棚・案内AI双方が同じ経路・同じタイミングで幅を取得するように統一。
  - `gadgetLayout.ts` を拡張: `CenterRect`（中央基準の生データ）をそのまま state に保持できるよう
    `loadLayoutsRaw`/`saveLayoutRaw`/`rectFromCenter`/`centerFromRect` を追加（既存の `loadLayouts`/
    `saveLayout` はこれらの薄いラッパーとして維持、既存テスト・呼び出し互換）。
  - `App.tsx` の `FloatingDesk`／`GuideAssistant.tsx` とも、位置は「中央基準の生データ」を state に持ち、
    **描画のたびに** `rectFromCenter(center, viewportWidth)` で絶対座標を計算する方式に統一（幅変化を
    検知してから位置を保存・読み直す、という中間ステップを廃止）。これで両者とも同じ1段の計算で、
    リサイズ中も滑らかに追従する。単体テスト4件追加（centerFromRect/rectFromCenter の往復・幅変更時の
    平行移動・raw API の保存復元・save系2種の整合）。
- 検証: build＋78テスト緑、2000→1200pxのリサイズで起動時console エラー無し。ログイン後の実際のドラッグ/
  リサイズでの体感差解消は要実機確認。

## 2026-07-06（フローティング配置を中央基準の座標に＋案内AIの初期位置を実測ベースに修正）

向井「フローティングの位置記録は左上角基準では？ウインドウ幅を変えたら崩れる。中央から測る方式に。
あと案内AIの初期位置が整列ボタンと重なって見えなくなってる」。

- **`host/gadgetLayout.ts` の保存形式を刷新**: 絶対座標(x,y)ではなく「画面中央からのオフセット(cx)」で
  保存するように変更。`loadLayouts(viewportWidth)`/`saveLayout(id, rect, viewportWidth)` が現在の
  ビューポート幅で相互変換する。ブラウザ幅を変えても、窓の中央に対する相対位置が保たれる
  （左上原点だと、幅を変えると配置がまるごと画面外にずれていた）。単体テスト5件を追加（往復・平行移動・
  負オフセット・clearLayouts・壊れたデータの無視）。
- **ガジェット（FloatingDesk）**: deskWidth が変わるたび（ResizeObserver）に `loadLayouts(deskWidth)` で
  読み直し、開いたまま resize しても中央基準の位置関係で追従するように。commit 時も現在の deskWidth で保存。
- **案内AI（GuideAssistant）**: resize イベントで `x += Δ中央`（新旧ウインドウ幅の中央差）を都度加算し、
  ドラッグ操作中は無視。ドラッグ終了時の保存は従来どおり `saveLayout` 経由（中央基準に自動変換）。
- **初期位置の重なりバグを修正**: 「整列する」行の下端Yを**実測**するように変更（以前はヘッダー高の
  ハードコード概算 y=210 で、実際のヘッダー拡大後のレイアウトとズレてボタンに重なっていた）。
  `FloatingDesk` が `tidyRowRef.getBoundingClientRect().bottom` を測って `onMeasureTop` で
  `Dashboard`→`App`（`guideTopY` state）→`GuideAssistant`（`defaultTopY` prop）へ伝播。
  未測定時（道具ゼロ・narrow画面等）は概算値 `FALLBACK_TOP_Y=220` にフォールバック。
- 検証: build＋74テスト緑、起動 console エラー無し。実際の重なり解消・resize追従はログイン後の実機で要確認。

## 2026-07-06（部屋帯ミラーを中央基準に＋整列範囲を中央1024帯に統一）

向井の再指摘。前回のミラーは「中央＝オリジナルの右端」になっていた（誤り）。
- **ミラータイルを"オリジナル中央"構成に作り直し**: タイル(3600) = [左半分の反転 | オリジナル(1800) | 右半分の反転]
  （＝無限ミラーパターンの2W窓）。`background-position:center` で画面中央にオリジナルが載り、限界に伸びた先だけ
  端から反転延長される（2000pxなら中央1800pxが原画・両端~100pxがミラー）。アップロードの canvas 生成も同構成に。
- **説明文＋「整列する」を中央1024帯の内側に**: full-bleed 棚の中で当該行を `mx-auto max-w-5xl`（右端＝中央+512）。
- **ガジェットの既定整列範囲を中央1024帯に**: defaultRect が band=min(1024,deskWidth)＋中央寄せ offset で配置
  （全幅に自由移動は可、整列＝中央帯）。
- **案内AIの初期位置も中央帯の右端**: defaultRect x = 画面中央+512-w（整列ボタンの下）。
- 検証: build＋69テスト緑、2000px でオリジナル中央・両端ミラー・console 無エラー。

## 2026-07-06（部屋帯を全幅ミラー＋名前チップ簡素化＋棚も全幅＋整列で案内AIも初期化＋ヘッダー整理）

向井の複数指摘（4Kで2000px幅表示する運用前提）。
- **部屋帯を全幅＋端ミラー**: サンプルを「ミラータイル」(`<id>-tile.webp`=元＋左右反転を横連結・3600x120)化し、
  InfoSlot 帯を full-bleed(100vw・`margin-left:calc(50%-50vw)`)＋`background:repeat-x / auto 120px`。どんな幅でも
  端から反転して隙間なく敷く。アップロード画像も canvas でミラータイル化。root に overflow-x-hidden。
- **名前チップ簡素化**: 「ようこそ」「さん」を削除。アイコン＋名前＋部屋番号のみ・横=内容幅・縦は半分。
  useAuth の profile に avatar/room_no を追加（select 拡張）。ニュースは縦積み最大2・1行コンパクトに。
- **棚(ガジェット)も全幅**: FloatingDesk を full-bleed に。deskWidth=ビューポート幅→左右どこにでも配置可
  （案内AIと同様の自由度）。
- **「整列する」で案内AIも初期位置へ**: App に layoutResetKey、tidy()→onTidy で increment、GuideAssistant が
  resetSignal 変化で defaultRect() に戻す。案内AIの初期位置を右上・整列ボタンの下(y≈210)に変更。
- **ヘッダー**: 「仮称」バッジと「Phase 1」を削除。NAGAYA-BASE を text-2xl に拡大しロゴ横にバランス配置。
- **文言修正**: 「見出しをドラッグ／右下でサイズ変更」→「見出しをドラッグで移動／縁や角のハンドルでサイズ変更」。
- 検証: build＋69テスト緑、2000px でミラー帯が全幅・ヘッダー確認・console エラー無し。実UIはログイン後に。

## 2026-07-06（自分の部屋のトップ帯＝背景画像＋ようこそ窓＋ニュース最大2。テーマで背景選択）

向井「ヘッダーとガジェット領域の間の120px帯を、部屋のカスタム領域にしたい。背景画像＋ユーザー名窓、
ニュースは中央〜右に最大2。テーマに『部屋のトップ背景』設定を」。
- 素材: `assets/src/room` の14枚（1800x120・外観/廊下/大家/職人/店子）を webp化（各~50KB）→ `public/img/room/`。
- theme: `ThemePrefs.roomBg`（未設定=既定サンプル/`none`/`sample:<id>`/data-URL）＋`ROOM_SAMPLES`＋`roomBgImage()`。
  applyTheme が `--nb-room-bg` を設定。既定は nagaya-rouka01。※幅は content(max-w-5xl≈1024)<画像1800 なので
  `background-size:cover` で常にきれいに収まる（"端から反転"はこの幅では発生しないので未実装・必要なら追加）。
- InfoSlot を「部屋トップの帯」に再設計: 高さ120px・背景=var(--nb-room-bg)。左=ようこそ窓（表示名。roomNoは
  auth.profile に無いので今は名前のみ）、右=ニュース最大2（速報！→回覧板→次の予定の優先、狭い画面は1つ）。
  情報が無くても帯（背景＋ようこそ）は出す。App→Dashboard→InfoSlot に userName を配線。
- ThemeEditor に「自分の部屋のトップ背景」: サンプル14のグリッド選択／自分の画像アップロード／背景なし／既定に戻す。
- 検証: build＋69テスト緑、モックで帯の見た目を確認（廊下背景＋ようこそ＋速報/回覧板が可読）。実UIはログイン後に確認。

## 2026-07-06（窓のリサイズを4辺4角に＋長屋の歩みを整理し各要素をリンク化）

向井の指摘2件。
- **フローティング窓のリサイズを4辺4角に**: 共有 `components/resizeHandles.tsx`（`ResizeHandles`＋
  `computeResize`＋`cursorForDir`・8方向）を新設し、棚のガジェット窓(FloatingWindow)と案内AI窓(GuideAssistant)
  の両方を右下角のみ→4辺4角に。西/北を掴むと位置(x/y)も動く・最小サイズ/画面外を考慮。右下だけ薄い掴み目印。
- **長屋の歩み(ProgressView)整理＋リンク化**: 意味の無かった「こつこつ貯まる」を削除。統計カードを
  「公開中の道具」「今月の新着」（→道具市）「入居者総数」（→入居者）に。※「今月の新規入居者」は
  ResidentEntry に入居日が無く算出不可のため入居者総数のみ（要ならプロフィールに created_at を足す）。
  「職人べつの公開数」の各職人→その人のプロフ（ResidentsView に focusName で表示名一致を自動選択）。
  ニュース(タイムライン)各項目→道具市の該当ガジェット（feed.target=道具ID）。App/HelpView 経由で
  onNavigate/onOpenGadget/onOpenResident を ProgressView へ配線。
- 検証: build＋69テスト緑、起動 console エラー無し。実操作(窓リサイズ/歩みリンク)はログイン後の画面で要確認。

## 2026-07-06（案内AIをストリーミング表示に＝文字が届き次第出す。体感TTFT改善）

向井「ストリーミングって文字が1行ずつ出るやつでは？今は6秒でいっぺんに出る」。→ その通り。案内AIの生成を
ストリーミング化した（#17 の一部）。
- サーバー: `/api/ai` guide を JSON一括 → **text/plain のストリーム**に。`openProviderStream`＋`sseToText`＋
  `extractDelta` で anthropic(content_block_delta)/openai(choices[].delta.content)/google(alt=sse) の SSE を
  本文デルタだけに変換して流す。設定/レート/生成開始失敗は本文開始前に JSON エラーで返す。出力の利用記録は
  流し終えた文字数で best-effort。事前段階(prep/rag)の時間は console に出す
- クライアント: `askGuide(messages, ctx, onDelta)` が `response.body` を逐次読み、TTFT/total を console.debug。
  GuideAssistant は空の吹き出しを置いて届いた文字を追記表示→全文が揃ったらツール/操作タグを解析して最終形に置換
  （タグは末尾なので体感クリーン。失敗時は空吹き出しを取消）
- 検証: build＋69テスト緑、ai.ts 型クリーン。**ストリーミングは Cloudflare Functions 上でのみ動く**（vite dev では
  /api/ai が無いので不可）→ 実挙動はデプロイ後に確認。tier=fast・並列prep と併せて体感短縮の想定

## 2026-07-06（夜間バッチ: 全操作マニュアル＋各所リンク＋速報/入居者→道具市＋案内AI遅延の計測/高速化）

向井「店子→職人→大家の順で全操作マニュアルを画像なし（文章＋図）で作り、各局面からマニュアルへ飛べる
リンクを。速報！や入居者の道具クリックで道具市の該当ガジェットへ。案内AIの遅延を計測して報告」。悩む所は推奨で。

- **マニュアル（案内所・全13本）**: 並列サブエージェント3体が実コードを読んで起草。店子(10-14)/職人(20-24,07補完)/
  大家(30-33)。HelpView TOC に「はじめに→店子→職人→大家→共通」順で登録。画像は使わず（流れ図SVGは07のみ）。
- **各画面に「❓使い方」**: ヘッダーに追加。現在画面→対応記事（VIEW_HELP）。help画面では非表示。
- **要素→対象リンク**: 速報！の道具公開項目（activity_feed.target=道具ID＝道具市dir）と、入居者の「作った/入れている道具」
  の道具名クリック → 道具市でそのカードへ scrollIntoView＋一瞬アウトライン強調（CatalogView に focusDir/onFocusHandled）。
  App に focusGadget 状態＋openCatalogGadget。※「全要素リンク」は代表2例＋使い方リンクを実装、パターン(onOpenGadget)は拡張容易。
- **案内AI遅延（#17 調査）**: 計測＝guide応答に timing{prepMs,ragMs,genMs,totalMs}＋console、client も console.debug。
  高速化＝準備(設定/レート/埋め込み/状態票)を Promise.all 並列＋状態票の3クエリも並列（旧: 全直列で ~8往復）／案内生成を
  fast tier モデルに／利用記録を waitUntil で応答から外す。**残: streaming（生成完了まで無表示の時間＝genMs を TTFT に。
  タグ解析ループとの両立にバッファ設計が要るため繰延）**。実測値はデプロイ後に timing で採取。
- 検証: build＋69テスト緑、dev 起動 console エラー無し。**案内AIの実レイテンシ数値と、マニュアル/リンクの実UIはデプロイ後に要確認**。

## 2026-07-06（はじめての道具づくり手順書＋案内所の画像対応。全体マニュアルは要相談）

向井「2号室アカウントで道具づくり準備中だが、Fork以前にGitHubアカウント作成の理解が要る。
『Fork を作る』はマニュアルに飛ぶべき。NAGAYA-BASEの全操作を画像付きマニュアルに」。
- 案内所（軽量mdレンダラ）に**画像対応**を追加（`![alt](/img/… or https:…)`。リンクより先に処理）。
- 新記事 `07-tsukuru-hajimete.md`「はじめての道具づくり（GitHubアカウントから）」: 登録→Fork→クラウド編集→
  push→部屋で試運転→PR を account-first で。**大家は Fork 不要**（自分のリポは fork 不可）を明記。
  流れ図 SVG `public/img/guide/tsukuru-flow.svg` を冒頭に。工房の「はじめての道具づくり（手順書）を開く」
  ボタン＝`onOpenHelp('07-tsukuru-hajimete')` から誘導（WorkshopView.onOpenHelp を article 受け取り化）。
- 正直な制約（向井に回答）: 実サイト（GitHub等）の**スクリーンショットは私が確実に用意できない**。
  文章＋SVG図＋（人手/ブラウザ操作で）実画面写真を後入れ、が現実解。全操作マニュアルは章立てを相談して段階作成。
- build＋69テスト緑、SVG配信200・画像記法の出力確認。

## 2026-07-06（ADR-012 Phase 0/1/2 第一版: クラウド編集導線＋部屋プレビュー実装）

向井「Phase 0＋1＋2 まで全部やって」。案1（クラウド編集＋部屋プレビュー）を段階実装。
- **Phase 2（部屋プレビュー・方式A gitベース）**: `functions/preview/[[path]].ts` が本人 fork の
  `gadgets/<id>/` を `/preview/<owner>/<branch>/<id>/...` で自オリジン中継。**安全性の肝＝HTML応答に
  `Content-Security-Policy: sandbox allow-scripts` を付与**し、iframe内でもURL直開きでも不透明オリジン化
  → 未レビューの fork コードがプラットフォームのセッション/localStorage(Supabaseトークン)に触れられない。
  別オリジン/署名トークンを新設せず同一オリジン配信の危険を封じる。GET限定・本家リポ名のみ・gadgets配下のみ
  （open-proxy/traversal 防止）。`_parse.ts`＋単体テスト13件。`gadgetHost` の manifest/entry に base 引数、
  `GadgetFrame` に `basePath`、工房に `GadgetPreview`（GitHubユーザー/ブランチ/道具ID→全画面で本番同等試運転）
- **Phase 1（オンボーディング）**: 工房「道具をつくる」と入口を**クラウド編集主体**に（Fork→Codespaces/ツール→
  push→部屋で試運転→PR）。ローカル（ウィザード）は details 内の任意手段へ降格。**ウィザード本体は据え置き**
  （＝ローカル派向けの選択肢として整合。再ビルド不要）
- **Phase 0（ズレ解消）**: 案内所「道具の作り方」を新フロー＋プレビュー＋「公開CIは準備中(予定)」に更新。
  RAG再索引はCIが .md push で実行
- 判断: 方式Aを採用（git履歴/CLAと整合・保管掃除不要）。sandbox-CSP で安全側。GitHubユーザー名は工房フォーム＋
  localStorage（DBマイグレーション回避）
- 検証: build＋69テスト緑、preview Function は standalone tsc 通過。**実機E2E（デプロイ後・実fork・ログイン）は要確認**。
  残: 実機確認／公開CI（Phase 3）／プレビューのfidelity（未インストール道具の storage RLS 等）は実機で詰める

## 2026-07-06（道具市の空ガジェット混入バグ＋根本原因の可視化フィルタ修正）

向井「道具市に中身が空のガジェット(dentaku/電卓)が出ている＝明確なバグ」。3エージェントの並行調査で確定。
- 直接原因: 私が `git add -A` で、向井がローカルで雛形コピーしただけの未追跡 `gadgets/dentaku`（中身は
  `_template` と1バイト違わぬ白紙）を commit 6419647 に巻き込んでしまった → デプロイ時の静的カタログに載った。
  → `gadgets/dentaku` を git rm（ee12dcf）。**再発防止として今後 `git add -A` は使わない**
- 根本原因（設計欠陥）: 道具市の母集団は静的 `/gadgets/index.json`（gadgets/* 全ディレクトリ、_ 始まり除く）。
  DBは「隠す」オーバーレイに過ぎない。CatalogView.isVisible が `if(!rec||published) return true` で、
  **DB行の無い（＝一度も登録/公開していない作りかけ）道具を既定で全員に公開**していた。dentaku は行が無いので
  隠せなかった。工房の公開トグルも admin 緊急停止も「DB行がある前提」で行の無い道具には効かない
- 修正: isVisible を「明示 published のみ一般公開／未公開・未登録は owner・admin のみ」に反転。ただし
  Supabase 未設定のローカルdev（`workshopAvailable()===false`）は判定不能なので従来どおり全件表示（雛形確認用）。
  可視性データ(RPC)が揃うまで描画を待つ recordsReady も追加（揃う前の一瞬の露出を防止）。seed で
  schedule-secretary は published 行があるので本番でも従来どおり表示される（確認済み）
- build＋56テスト緑。開発→公開フロー全体の再設計は別途（下の設計相談参照）

## 2026-07-05（道具づくりを工房へ集約: ウィザードから step5 廃止＋工房に道具づくり/改善/複製）

向井の判断（設問）: 道具づくりは工房に集約（推奨）／完成画面は窓拡大で1画面のまま。
制約の明示: 工房はWebなのでローカルにファイルは作れない → 道具づくりは「AI指示文＋コマンド」の案内。

- ウィザード: step5「最初の道具」（雛形をローカルに作る）を廃止。5段階に（ようこそ/環境診断/GitHub連携/
  長屋に入る/完成）。完成は `npm run dev`（platform）を起動して長屋を開き、「工房で最初の道具を」へ誘導。
  main.js `dev:run` は `npm run dev:gadget <id>`→`npm run dev`（作る道具が無いのでプラットフォームを起動）
- 工房（platform）: `host/toolPrompts.ts`（お題5種＋newTool/improve/duplicate の指示文テンプレ）を新設。
  「あなたの道具」と「AI設定」の間に**「新しい道具をつくる」**（お題→ID→AI指示文をコピー）を配置。
  各道具に**「改善する / 複製して新規」**ボタン→その道具向けのAI指示文を出す（PromptBox でコピー）。
  実作成・改修はPCのリポジトリで Claude Code 等にこの指示文を貼って行う旨を明記
- 完成画面は1画面のまま（窓拡大で収まる）。step5廃止で完成画面も軽くなった
- build＋56テスト緑。ウィザードは要再ビルド（CI）

## 2026-07-05（ウィザード修正: 開発サーバ起動の不発バグ＋枠を大きく＋背景を見せる）

向井の実機試用フィードバック。
- **バグ: 「開発サーバを起動してブラウザで開く」を押しても何も起きない** → 原因は Vite 出力の
  ANSI 色コードで URL 検出正規表現が `localhost:` と番号の間で切れて一致しないこと（`localhost:‹ESC›[1m5186`）。
  main.js に `stripAnsi` を追加し、ログ出力・URL検出の前に色コードを除去。ポートが 5186 等に
  ずれても開くように（実機はポート 5173〜5185 使用中で 5186 になっていた）
- 潜在バグ: `ensureUpstreamRemote` が未import の `exec` を使用（fork経路で ReferenceError）→ import 追加
- **枠が小さく内容がはみ出す/背景がほぼ見えない** → BrowserWindow を 900x880・最小サイズ指定・リサイズ可に。
  CSS を圧縮（font 15→14・余白/パディング縮小）し、ステップのパネルを半透明（cream 0.82＋blur）にして
  背景の水彩が透けるように
- 残（別途・要相談で保留）: 完成画面(step6)を「AIに作らせる/開発サーバ起動」の選択→各ページ化、
  ウィザードの「最初の道具」(step5)を廃し工房側へ、工房の各道具に「改善する/複製して新規」ボタン

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
