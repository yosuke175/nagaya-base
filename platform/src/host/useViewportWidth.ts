import { useEffect, useState } from 'react'

// 現在のビューポート幅を追跡する共有フック。ガジェットの棚・案内AI窓の両方で
// これを使うことで、ブラウザ幅が変わったときの位置計算が完全に同じタイミング・
// 同じ値で走る（片方だけ別の仕組み(resizeイベント)・別のタイミング(effect経由の
// 一拍遅れた再計算)を使うと、動きの滑らかさに差が出てしまうため）。
// ResizeObserver は resize イベントより高頻度・低遅延で変化を拾える。
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])
  return width
}
