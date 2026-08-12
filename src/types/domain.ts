export const GENDERS = ['男性', '女性'] as const
export type Gender = (typeof GENDERS)[number]

export const DEDICATIONS = ['兄弟', '姉妹'] as const
export type Dedication = (typeof DEDICATIONS)[number]

// 「会衆の伝道者記録」(S-21相当)の公式書式の表記に合わせる
export const HOPES = ['ほかの羊', '天に行く者'] as const
export type Hope = (typeof HOPES)[number]

export const QUALIFICATIONS = ['長老', '援助奉仕者'] as const
export type Qualification = (typeof QUALIFICATIONS)[number]

// Excelの「立場」列に相当。報告時点の身分としてservice_reportsにもスナップショットを持つ。
export const PIONEER_STATUSES = ['伝道者', '補助開拓者', '正規開拓者', '特別開拓者', '野外の宣教者', '不活発者'] as const
export type PioneerStatus = (typeof PIONEER_STATUSES)[number]

// 年間/月間要求時間・年度末お知らせ・開拓者進捗の色分けなど、時間要求に関する項目が必要な立場
// (補助開拓者は15h/30hの短期キャンペーンで年間・月間の要求時間という概念が無いため対象外)
export const PIONEER_TARGET_STATUSES = ['正規開拓者', '特別開拓者', '野外の宣教者'] as const

// 名簿・帳票印刷の伝道者選択リストの並び順(伝道者→正規開拓者→特別開拓者→野外の宣教者を優先し、
// 補助開拓者・不活発者は末尾)。PIONEER_STATUSESの宣言順(伝道者→補助開拓者→…)とは別物であることに注意
// — こちらは表示順専用で、他の並び替えロジック(報告一覧の月次グルーピングなど)には使わない
export const ROSTER_STATUS_ORDER = ['伝道者', '正規開拓者', '特別開拓者', '野外の宣教者', '補助開拓者', '不活発者'] as const

export const STAFF_ROLES = ['admin', 'overseer'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export interface Group {
  id: string
  name: string
}

export interface Publisher {
  id: string
  last_name: string
  first_name: string
  last_name_kana: string | null
  first_name_kana: string | null
  romaji: string | null
  gender: Gender
  birth_date: string | null
  baptism_date: string | null
  dedication: Dedication
  hope: Hope
  group_id: string | null
  elder_qualified_on: string | null
  servant_qualified_on: string | null
  pioneer_started_on: string | null
  qualification: Qualification | null
  pioneer_status: PioneerStatus
  // 開拓者の年間要求時間(例: 正規開拓者600h)。Excelの`開拓者進捗`シートの「要求時間」列に相当し、
  // 立場から自動算出せず個別に設定できるようにしている(Excel側も行ごとの固定値だったため踏襲)。
  annual_hour_target: number | null
  // 月間要求時間。年間要求時間を単純に12等分した値とは限らない(端数調整など)ため、別項目として持つ。
  // 開拓者進捗ページの色分け判定に使う。
  monthly_hour_target: number | null
  is_active: boolean
  auth_user_id: string | null
  created_at: string
}

export interface ServiceReport {
  id: string
  publisher_id: string
  year: number
  month: number
  preached: boolean
  bible_studies: number
  hours: number
  considered_hours: number
  remarks: string | null
  pioneer_status_snapshot: PioneerStatus
  // 転入前の記録など、本人の記録には残すが集計には反映させたくない報告に立てるフラグ
  no_count: boolean
  created_at: string
}

export interface Staff {
  user_id: string
  role: StaffRole
  display_name: string
  email: string | null
}

// 公開報告フォーム(未ログイン)向けのRPC public_match_publisher の返り値に対応する、
// 個人情報を含まない最小限の型。氏名は入力された1人分のみを都度返し、
// 一覧をまるごとは返さない(会衆全員の氏名を未ログインの相手に晒さないため)
export interface PublicPublisherMatch {
  id: string
  last_name: string
  first_name: string
  pioneer_status: PioneerStatus
  group_id: string | null
  monthly_hour_target: number | null
  exact: boolean
}
