# frontend-design.md — NAGAYA-BASE 見た目の憲法

水彩イラストの世界観で UI を統一するためのデザイントークンと語彙。
**新規UIはこれに従い、既存UIも順次これに寄せる。** 色・語彙はハードコードせず、
CSS変数（`--nb-*`）と定数（`platform/src/assets.ts` / 下記語彙）から参照する。

## カラーパレット

水彩版パワポと統一。CSS変数は `platform/src/index.css` の `:root` に定義する。

| トークン | 変数 | 値 | 用途 |
|---|---|---|---|
| navy | `--nb-navy` | `#1E2C4A` | 主要テキスト・見出し |
| terra | `--nb-terra` | `#B85042` | アクセント・職人・速報 |
| sage | `--nb-sage` | `#6E8F7C` | 店子・成功 |
| gold | `--nb-gold` | `#C9A15A` | 濃色背景上のアクセント |
| cream | `--nb-cream` | `#F1EEE3` | カード地・パネル |
| ink | `--nb-ink` | `#2D2A26` | 本文 |

補助トーン（パネルの半透明・境界）は上記からの派生で作る（新色を足さない）。

## タイポグラフィ

- 見出し: 太字ゴシック（`font-bold`）。色は navy
- 本文: 可読性重視、色は ink。**日本語を第一言語**とする
- 数字・コードは等幅

## 質感の原則

- 全体の地紋に `textures/washi.webp` を淡く敷く（`assets.ts` の `IMG.textures.washi`）
- カードは cream の半透明パネル（水彩背景がうっすら透ける程度）+ 柔らかいシャドウ + 角丸
- 濃色セクションは navy 地に `textures/indigo-linen.webp` を重ねてもよい
- ヘッダー/区切りに `textures/shoji.webp`、フッターに `textures/tatami.webp`

## 世界観の語彙（UIコピーで統一）

CLAUDE.md の語彙帳と一致させること。表示文字列に使い、内部の識別子（role値など）は
英語のまま（例: 「職人」の内部ロールは `developer`）。

| 世界観の語 | 意味 | 内部の対応 |
|---|---|---|
| 長屋（ながや） | プラットフォーム全体 | platform（表示名は仮称、config参照） |
| 棚（たな） | 各ユーザーのダッシュボード | dashboard |
| 道具（どうぐ） | ガジェット | gadget |
| 道具市（どうぐいち） | カタログ | catalog |
| 工房（こうぼう） | 職人の開発画面・入口 | 開発者向け導線 |
| 部屋（へや） | 各自の居場所・作業単位 | — |
| 大家（おおや） | 管理者 | admin |
| 職人（しょくにん） | 道具をつくる人 | developer |
| 店子（たなこ） | 道具をつかう人 | user |
| 軒先（のきさき） | 体験のみのゲスト | guest |
| 回覧板 | 運営→全体の告知 | announcements |
| 速報！ | 新リリースの自動通知 | activity_feed |
| 長屋暦（ながやごよみ） | 運営カレンダー | events |
| 案内所（あんないじょ） | Q&A・Howto | help center |
| 長屋の歩み | リリースの可視化 | progress timeline |

## 画像アセット

用途と対応ファイルは `platform/src/assets.ts`（`IMG.*`）と `assets/MANIFEST.md` を参照。
Web には最適化済み WebP（`platform/public/img/`）のみを載せ、原本 PNG は `assets/src/` に置く。
