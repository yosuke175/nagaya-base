// Web-optimized image asset paths (指示書 ④⑤⑥ STEP 0).
// Never hardcode image paths in components — import from here so the asset
// pipeline (scripts/optimize-assets.mjs) stays the single source of truth.
// Originals + naming: assets/MANIFEST.md.

const base = '/img'

export const IMG = {
  keyvisual: {
    /** 門と小道の全景。Web ヒーロー / OGP */
    gateStreet: `${base}/keyvisual/gate-street.webp`,
    /** 左=工房・右=店の額縁構図。入口の職人/店子分岐 */
    workshopShopFrame: `${base}/keyvisual/workshop-shop-frame.webp`,
    /** 賑わう店内。店子トラック / コミュニティ紹介 */
    marketplace: `${base}/keyvisual/marketplace.webp`,
  },
  backgrounds: {
    softNoren: `${base}/backgrounds/soft-noren.webp`,
    deskCode: `${base}/backgrounds/desk-code.webp`,
    workshopLantern: `${base}/backgrounds/workshop-lantern.webp`,
    shopTablet: `${base}/backgrounds/shop-tablet.webp`,
    norenCode: `${base}/backgrounds/noren-code.webp`,
    wideTown: `${base}/backgrounds/wide-town.webp`,
    shopInterior: `${base}/backgrounds/shop-interior.webp`,
    workshopWide: `${base}/backgrounds/workshop-wide.webp`,
    workshopTools: `${base}/backgrounds/workshop-tools.webp`,
  },
  objects: {
    hairComb: `${base}/objects/hair-comb.webp`, // 店子バッジ
    happiCoat: `${base}/objects/happi-coat.webp`, // 職人バッジ
    geta: `${base}/objects/geta.webp`,
    futon: `${base}/objects/futon.webp`,
    waterBucket: `${base}/objects/water-bucket.webp`,
    riceBarrel: `${base}/objects/rice-barrel.webp`, // 保存・蓄積の暗喩
    well: `${base}/objects/well.webp`, // 共有リソース・空状態
    shichirin: `${base}/objects/shichirin.webp`,
    uchiwaFan: `${base}/objects/uchiwa-fan.webp`,
  },
  textures: {
    washi: `${base}/textures/washi.webp`, // 全体の地紋
    shoji: `${base}/textures/shoji.webp`, // ヘッダー・区切り
    tatami: `${base}/textures/tatami.webp`, // フッター
    indigoLinen: `${base}/textures/indigo-linen.webp`, // 濃色セクション
  },
} as const
