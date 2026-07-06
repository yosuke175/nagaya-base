import { useEffect, useState } from 'react'

// 現在のビューポート幅を追跡する共有フック。ガジェットの棚・案内AI窓の両方で
// これを使うことで、ブラウザ幅が変わったときの位置計算が完全に同じタイミング・
// 同じ値で走る（片方だけ別の仕組み(resizeイベント)・別のタイミング(effect経由の
// 一拍遅れた再計算)を使うと、動きの滑らかさに差が出てしまうため）。
// ResizeObserver は resize イベントより高頻度・低遅延で変化を拾える。
//
// window.innerWidth ではなく document.documentElement.clientWidth を使うこと。
// 縦スクロールバーが出ている状態では、window.innerWidth はスクロールバー分を
// 含んだ値になるが、CSSの `calc(50% + Npx)`（position:fixed／position:absolute
// のどちらでも）はスクロールバーを除いた clientWidth を基準に解決される。この
// 食い違いがあると、ドラッグ中の絶対座標(JS計算・window.innerWidth基準)と、
// 静止時のCSS計算(clientWidth基準)がスクロールバー幅ぶんズレて、マウスを離した
// 瞬間に窓が一瞬「ブルッ」とずれる（スクロールバー幅は通常15px前後）。
export function currentViewportWidth(): number {
  return document.documentElement.clientWidth
}

export function useViewportWidth(): number {
  const [width, setWidth] = useState(currentViewportWidth)
  useEffect(() => {
    const update = () => setWidth(currentViewportWidth())
    update()
    const observer = new ResizeObserver(update)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])
  return width
}
