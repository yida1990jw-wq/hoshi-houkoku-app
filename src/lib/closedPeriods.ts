import { supabase } from './supabaseClient'

// 月の「確定」。全員の報告がそろって集計を確定したあと、報告フォームからの
// 追加・上書きを止める。
//
// 実際に止めているのはRLS(0009のポリシー)で、画面側は表示と操作のためだけにこれを使う。
// 報告フォームは未ログインで動き、anonキーは公開されているので、画面で隠すだけでは防げない。
// 管理者は確定後も報告一覧から編集できる(遅れて出された分を手入力できるようにするため)。

export interface ClosedPeriod {
  year: number
  month: number
  closed_at: string
}

/** その月が確定済みか。未ログインからも呼べる(判定結果だけを返す関数を経由する) */
export async function isPeriodClosed(year: number, month: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_period_closed', { p_year: year, p_month: month })
  if (error) throw error
  return !!data
}

export async function fetchClosedPeriod(year: number, month: number): Promise<ClosedPeriod | null> {
  const { data, error } = await supabase
    .from('closed_periods')
    .select('year, month, closed_at')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  return (data as ClosedPeriod | null) ?? null
}

export async function closePeriod(year: number, month: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('closed_periods')
    .insert({ year, month, closed_by: auth.user?.id ?? null })
  if (error) throw error
}

export async function reopenPeriod(year: number, month: number): Promise<void> {
  const { error } = await supabase.from('closed_periods').delete().eq('year', year).eq('month', month)
  if (error) throw error
}
