import { supabase } from '../auth/supabaseClient'

// AI使用量の可視化（ai_usage を集計）。ユーザーは自分の当月概算費用を見る。
// 円換算は固定レートの概算（為替は追わない）。正確な課金は各社ダッシュボード。

export const JPY_PER_USD = 160 // 概算レート（固定）

function monthStartIso(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

/** 自分の当月の概算費用（USD）。RLS で自分の行のみ集計される。未接続時は null。 */
export async function myMonthlyCostUsd(): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ai_usage')
    .select('est_cost_usd')
    .gte('created_at', monthStartIso())
  if (error) return null
  return (data ?? []).reduce(
    (sum, row) => sum + Number((row as { est_cost_usd: number }).est_cost_usd || 0),
    0,
  )
}
