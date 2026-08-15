// 公開報告フォームの入力から、実際にservice_reportsへ保存する値を組み立てるルール
// (以前はGoogleスプレッドシートの数式が担っていた「整える」処理のうち、①②に相当)

import { supabase } from './supabaseClient'

export const CONSIDERATION_REASONS = ['巡回大会奉仕', '地区大会奉仕', '開拓者学校', 'PVG', '国際大会奉仕', 'その他'] as const
export type ConsiderationReason = (typeof CONSIDERATION_REASONS)[number]

// 設定画面(report_rules テーブル)から変えられるルール。
// 読み込みに失敗しても報告フォームが止まらないよう、必ずこの既定値へ退避する
export interface ReportRules {
  consideredHoursCap: number
  consideredCapExemptReason: string
  auxPioneerHours: number[]
}

export const DEFAULT_REPORT_RULES: ReportRules = {
  consideredHoursCap: 55,
  consideredCapExemptReason: '開拓者学校',
  auxPioneerHours: [15, 30],
}

export async function fetchReportRules(): Promise<ReportRules> {
  const { data, error } = await supabase
    .from('report_rules')
    .select('considered_hours_cap, considered_cap_exempt_reason, aux_pioneer_hours')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return DEFAULT_REPORT_RULES
  return {
    consideredHoursCap: data.considered_hours_cap ?? DEFAULT_REPORT_RULES.consideredHoursCap,
    consideredCapExemptReason: data.considered_cap_exempt_reason ?? DEFAULT_REPORT_RULES.consideredCapExemptReason,
    auxPioneerHours:
      Array.isArray(data.aux_pioneer_hours) && data.aux_pioneer_hours.length > 0
        ? data.aux_pioneer_hours
        : DEFAULT_REPORT_RULES.auxPioneerHours,
  }
}

// ①考慮時間の上限。免除する理由(既定では「開拓者学校」)が選ばれていれば入力値をそのまま使う
// (免除理由は他の理由と同時選択できないため、含まれていれば必ず単独)。
// それ以外の理由は、奉仕時間+考慮時間が上限を超える場合、上限に届く分だけに自動調整する
export function capConsideredHours(
  hours: number,
  consideredHoursRaw: number,
  reasons: readonly ConsiderationReason[],
  rules: ReportRules = DEFAULT_REPORT_RULES,
): number {
  if (consideredHoursRaw <= 0) return 0
  if (reasons.includes(rules.consideredCapExemptReason as ConsiderationReason)) return consideredHoursRaw
  const total = hours + consideredHoursRaw
  if (total <= rules.consideredHoursCap) return consideredHoursRaw
  return Math.max(0, rules.consideredHoursCap - hours)
}

export interface RemarksInput {
  // 伝道者のみ: 補助開拓を行った月なら、その時間数(15/30など)
  auxHours: number | null
  // 正規開拓者・特別開拓者・野外の宣教者のみ: 考慮理由(複数選択可、免除理由のみ単独)
  reasons: readonly ConsiderationReason[]
  otherReasonText: string
  consideredHoursRaw: number
  cappedConsideredHours: number
  ownRemarks: string
}

// ②備考の自動合成。補助開拓なら「AP15」「AP30」のように時間を付けたものを、
// 考慮理由があれば「{理由} {入力した考慮時間}h（加算時間 {実際に採用した考慮時間}h）」を
// 先頭に付け、本人の備考を続ける
export function composeRemarks({
  auxHours,
  reasons,
  otherReasonText,
  consideredHoursRaw,
  cappedConsideredHours,
  ownRemarks,
}: RemarksInput): string {
  const own = ownRemarks.trim()

  if (auxHours !== null) return [`AP${auxHours}`, own].filter(Boolean).join(' ')

  if (reasons.length > 0) {
    const reasonLabels = reasons.map((r) => (r === 'その他' ? otherReasonText.trim() || 'その他' : r)).join('、')
    const prefix = `${reasonLabels} ${consideredHoursRaw}h（加算時間 ${cappedConsideredHours}h）`
    return [prefix, own].filter(Boolean).join(' ')
  }

  return own
}
