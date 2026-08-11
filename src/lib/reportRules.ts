// 公開報告フォームの入力から、実際にservice_reportsへ保存する値を組み立てるルール
// (以前はGoogleスプレッドシートの数式が担っていた「整える」処理のうち、①②に相当)

export const CONSIDERATION_REASONS = ['巡回大会奉仕', '地区大会奉仕', '開拓者学校', 'PVG', '国際大会奉仕', 'その他'] as const
export type ConsiderationReason = (typeof CONSIDERATION_REASONS)[number]

// ①考慮時間の55時間キャップ。「開拓者学校」が理由なら無条件に入力値をそのまま使う
// (開拓者学校は他の理由と同時選択不可のため、含まれていれば必ず単独)。
// それ以外の理由は、奉仕時間+考慮時間が55時間を超える場合、55時間に届く分だけに自動調整する
export function capConsideredHours(hours: number, consideredHoursRaw: number, reasons: readonly ConsiderationReason[]): number {
  if (consideredHoursRaw <= 0) return 0
  if (reasons.includes('開拓者学校')) return consideredHoursRaw
  const total = hours + consideredHoursRaw
  if (total <= 55) return consideredHoursRaw
  return Math.max(0, 55 - hours)
}

export interface RemarksInput {
  // 伝道者のみ: 補助開拓を行った月かどうか
  auxChoice: '15' | '30' | null
  // 正規開拓者・特別開拓者・野外の宣教者のみ: 考慮理由(複数選択可、開拓者学校のみ単独)
  reasons: readonly ConsiderationReason[]
  otherReasonText: string
  consideredHoursRaw: number
  cappedConsideredHours: number
  ownRemarks: string
}

// ②備考の自動合成。補助開拓(15h/30h)なら「AP15」「AP30」を、考慮理由があれば
// 「{理由} {入力した考慮時間}h（加算時間 {実際に採用した考慮時間}h）」を先頭に付け、本人の備考を続ける
export function composeRemarks({
  auxChoice,
  reasons,
  otherReasonText,
  consideredHoursRaw,
  cappedConsideredHours,
  ownRemarks,
}: RemarksInput): string {
  const own = ownRemarks.trim()

  if (auxChoice === '15') return ['AP15', own].filter(Boolean).join(' ')
  if (auxChoice === '30') return ['AP30', own].filter(Boolean).join(' ')

  if (reasons.length > 0) {
    const reasonLabels = reasons.map((r) => (r === 'その他' ? otherReasonText.trim() || 'その他' : r)).join('、')
    const prefix = `${reasonLabels} ${consideredHoursRaw}h（加算時間 ${cappedConsideredHours}h）`
    return [prefix, own].filter(Boolean).join(' ')
  }

  return own
}
