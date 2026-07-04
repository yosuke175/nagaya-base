// クライアント側で画像を縮小・圧縮して data-URL 化する（「軽い画像だけ」を保証）。
// Supabase Storage を使わず、小さな data-URL を DB(text) に保存する方針のための基盤。

export interface CompressResult {
  dataUrl: string
  bytes: number
}

/**
 * @param maxDim  長辺の最大px（超えたら縮小）
 * @param maxBytes 出力 data-URL のバイト上限。超えたら品質を下げて再試行し、
 *                 それでも超えるならエラー（= もっと軽い画像を促す）
 */
export async function compressImageToDataUrl(
  file: File,
  maxDim: number,
  maxBytes: number,
): Promise<CompressResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('画像ファイルを選んでください')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を処理できませんでした')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const dataUrl = canvas.toDataURL('image/webp', quality)
    // data-URL のバイト数の近似（base64 は元の約4/3）
    const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
    if (bytes <= maxBytes) return { dataUrl, bytes }
  }
  throw new Error(
    `画像が大きすぎます（${Math.round(maxBytes / 1024)}KB以内にできませんでした）。もっと軽い画像を選んでください。`,
  )
}
