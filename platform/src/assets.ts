// Web-optimized image asset paths (指示書 ④⑤⑥ STEP 0).
// Never hardcode image paths in components — import from here so the asset
// pipeline (scripts/optimize-assets.mjs) stays the single source of truth.
//
// ⚠ ファイル名と中身の不一致に注意（2026-07-04 実物監査で確定。assets/MANIFEST.md
// の訂正表を参照）。このマッピングは「意味キー → 実際にその絵が入っているファイル」
// で張ってあるため、**必ずキー名で参照する**こと（ファイル名からの推測は禁物）。

const base = '/img'

export const IMG = {
  keyvisual: {
    /** 門と小道の全景。Web ヒーロー / OGP */
    gateStreet: `${base}/keyvisual/gate-street.webp`,
    /** 左=工房・右=店の額縁構図（実体は wide-town.png）。入口の職人/店子分岐 */
    workshopShopFrame: `${base}/backgrounds/wide-town.webp`,
    /** 賑わう店内。店子トラック / コミュニティ紹介 */
    marketplace: `${base}/keyvisual/marketplace.webp`,
  },
  backgrounds: {
    softNoren: `${base}/backgrounds/soft-noren.webp`,
    deskCode: `${base}/backgrounds/desk-code.webp`,
    workshopLantern: `${base}/backgrounds/workshop-lantern.webp`,
    shopTablet: `${base}/backgrounds/shop-tablet.webp`,
    norenCode: `${base}/backgrounds/noren-code.webp`,
    shopInterior: `${base}/backgrounds/shop-interior.webp`,
    workshopWide: `${base}/backgrounds/workshop-wide.webp`,
    workshopTools: `${base}/backgrounds/workshop-tools.webp`,
  },
  objects: {
    /** 法被（藍・組子柄）＝職人バッジ。実体は rice-barrel.png */
    happiCoat: `${base}/objects/rice-barrel.webp`,
    /** 櫛と簪＝店子バッジ */
    hairComb: `${base}/objects/hair-comb.webp`,
    /** 井戸（共有リソース・空状態）。実体は geta.png */
    well: `${base}/objects/geta.webp`,
    /** 草履（入居・軒先）。実体は well.png */
    zori: `${base}/objects/well.webp`,
    /** 布団。実体は obj-32.png */
    futon: `${base}/objects/obj-32.webp`,
    /** 手桶と柄杓。実体は obj-33.png */
    waterBucket: `${base}/objects/obj-33.webp`,
    /** 米櫃と簾（保存・蓄積の暗喩）。実体は obj-34.png */
    riceBarrel: `${base}/objects/obj-34.webp`,
    /** 七輪（集いの暗喩）。実体は futon.png */
    shichirin: `${base}/objects/futon.webp`,
    /** 団扇（波柄）。実体は water-bucket.png */
    uchiwaFan: `${base}/objects/water-bucket.webp`,
  },
  textures: {
    washi: `${base}/textures/washi.webp`, // 全体の地紋
    shoji: `${base}/textures/shoji.webp`, // ヘッダー・区切り
    tatami: `${base}/textures/tatami.webp`, // フッター
    indigoLinen: `${base}/textures/indigo-linen.webp`, // 濃色セクション
    /** 木目。実体は objects/happi-coat.png */
    wood: `${base}/objects/happi-coat.webp`,
    /** 土壁・漆喰。実体は objects/shichirin.png */
    plaster: `${base}/objects/shichirin.webp`,
    /** 石畳。実体は objects/uchiwa-fan.png */
    stonePavement: `${base}/objects/uchiwa-fan.webp`,
    /** 瓦屋根。実体は keyvisual/workshop-shop-frame.png */
    roofTiles: `${base}/keyvisual/workshop-shop-frame.webp`,
  },
} as const
