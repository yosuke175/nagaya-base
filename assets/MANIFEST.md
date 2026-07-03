# NAGAYA-BASE 画像アセット・マニフェスト

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

## パワポ以外の推奨用途（Code向け）
- Webヒーロー: keyvisual/gate-street.png
- 入口分岐画面の背景: keyvisual/workshop-shop-frame.png（左=職人、右=店子と一致）
- 職人ロールの象徴: objects/happi-coat.png（法被）
- 店子ロールの象徴: objects/hair-comb.png または marketplace.png
- 地紋/カード背景: textures/washi.png
- ローディング/空状態: objects/well.png や objects/rice-barrel.png
