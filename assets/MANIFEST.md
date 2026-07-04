# NAGAYA-BASE 画像アセット・マニフェスト

> ⚠ **訂正（2026-07-04 実物監査）**: 以下の説明のうち複数のファイルで
> **ファイル名と中身が一致していない**ことが判明した。実際の対応は本ファイル末尾の
> 「訂正表」と、コードから使う正典 `platform/src/assets.ts` を参照。
> ファイル名からの推測でアセットを使わないこと。

出典: ChatGPTで生成（権利は向井庸祐に帰属、商用利用可）。
配置先: リポジトリの `assets/` 直下にこのディレクトリ構造ごと展開。
注意: AI生成画像のため、独占的な権利主張（著作権登録・差止）には制約あり。
      ロゴなど独占したいものは人手を加えるか商標で押さえること。

## keyvisual/ — キービジュアル（表紙・ヒーロー・チラシ）
- gate-street.png ......... 門と小道の全景。左に工房・右に店、中央奥に長屋の路地。パワポ表紙/Webヒーロー/チラシ に最適
- workshop-shop-frame.png . 左に工房・右に店を配し中央が広く空いた額縁構図。職人/店子の分岐画面 に最適
- marketplace.png ......... 賑わう店内で人物がタブレットを使う。店子トラック/コミュニティ紹介 向け
- flyer-original.png ...... ChatGPT作の完成チラシ（要テキスト修正: Honnmono→Honmono、法人格表記、AIアプリ→道具）
- asset-sheet.png ......... アセット一覧見本（参考用、直接は使わない）

## backgrounds/ — 背景（横長16:9・余白あり。テキストを重ねる前提）
- soft-noren.png ......... 淡い。左上に暖簾、右上にアプリアイコンの散り。情報スライドの淡背景 向け
- desk-code.png .......... 作業机とコードエディタ。実績/開発系スライド 向け
- workshop-lantern.png ... 工房とランタン。章扉/静かな場面 向け
- shop-tablet.png ........ 店先とタブレット。店子系 向け
- noren-code.png ......... </>暖簾とランタン。開発系 向け
- wide-town.png .......... 町並みワイド。構造説明 向け
- shop-interior.png ...... 店内（アプリ棚が並ぶ）。カタログ/店子 向け
- workshop-wide.png ...... 工房ワイド。職人系 向け
- workshop-tools.png ..... 工具と机の工房。職人系 向け

## objects/ — 小物イラスト（正方形・バッジやアクセント用）
- hair-comb.png .......... 櫛と簪（花飾り）。装飾/店子バッジ 向け
- geta.png ............... 下駄。「入居」「軒先」アイコン 向け
- futon.png .............. 布団。「入居」「部屋」アイコン 向け
- water-bucket.png ....... 手桶と柄杓
- rice-barrel.png ........ 米櫃と簾（ストレージ/保存の暗喩に使える）
- well.png ............... 井戸（共有リソースの暗喩に使える）
- shichirin.png .......... 七輪（コミュニティ/集いの暗喩）
- uchiwa-fan.png ......... 団扇（波柄）。装飾
- happi-coat.png ......... 法被（藍・組子柄）。「職人」バッジ に最適
- obj-32.png / obj-33.png / obj-34.png ... その他小物（布団/桶/米櫃系。中身確認して割当）

## textures/ — テクスチャ（シームレス・背景パターン）
- washi.png .............. 和紙。全体の地紋 向け
- shoji.png .............. 障子の格子。ヘッダー/区切り 向け
- tatami.png ............. 畳。フッター/和の下地 向け
- indigo-linen.png ....... 藍染めの布。濃色セクション/暖簾 向け

## 訂正表（2026-07-04 実物監査で確定した「ファイル名 → 実際の中身」）

Claude Code が全画像を1枚ずつ開いて確認した結果。ズレていたのは以下（記載のないファイルは名前どおり）:

| ファイル | 実際の中身 | 備考 |
|---|---|---|
| keyvisual/workshop-shop-frame.png | 瓦屋根テクスチャ | 額縁構図ではない |
| backgrounds/wide-town.png | **額縁構図（左工房・右店・中央余白+ロゴ）** | 本来の workshop-shop-frame。入口分岐の背景はこれ |
| objects/happi-coat.png | 木目テクスチャ | 法被ではない |
| objects/rice-barrel.png | **法被（藍・組子柄）** | 職人バッジはこれ |
| objects/geta.png | 井戸 | |
| objects/well.png | 草履 | |
| objects/futon.png | 七輪 | |
| objects/obj-32.png | 布団 | |
| objects/obj-33.png | 手桶と柄杓 | |
| objects/obj-34.png | 米櫃と簾 | |
| objects/shichirin.png | 土壁・漆喰テクスチャ | |
| objects/water-bucket.png | 団扇（波柄） | |
| objects/uchiwa-fan.png | 石畳テクスチャ | |

一致確認済み: hair-comb（櫛と簪）、gate-street、marketplace、backgrounds 7枚、textures 4枚。
コードからの参照は必ず `platform/src/assets.ts` の意味キー経由で行う。

## パワポ以外の推奨用途（Code向け）
- Webヒーロー: keyvisual/gate-street.png
- 入口分岐画面の背景: keyvisual/workshop-shop-frame.png（左=職人、右=店子と一致）
- 職人ロールの象徴: objects/happi-coat.png（法被）
- 店子ロールの象徴: objects/hair-comb.png または marketplace.png
- 地紋/カード背景: textures/washi.png
- ローディング/空状態: objects/well.png や objects/rice-barrel.png
