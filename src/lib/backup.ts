import { supabase } from './supabaseClient'

// 会衆の記録はSupabaseの1か所にしかなく、無料プランには自動バックアップが無い。
// 誤操作や障害に備えて手元に控えを残せるようにする。

// Supabaseは1クエリ最大1000件しか返さないため、必ず分割して取り切る
// (この上限を踏まえずに書いたクエリで、過去に集計が過少になる不具合を起こしている)
const PAGE_SIZE = 1000

async function fetchAllRows(table: string, orderBy: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy)
      .range(from, from + PAGE_SIZE - 1)
      .returns<Record<string, unknown>[]>()
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}

export interface BackupData {
  exportedAt: string
  groups: Record<string, unknown>[]
  publishers: Record<string, unknown>[]
  serviceReports: Record<string, unknown>[]
  reportRules: Record<string, unknown>[]
}

export async function fetchBackup(): Promise<BackupData> {
  const [groups, publishers, serviceReports] = await Promise.all([
    fetchAllRows('groups', 'name'),
    fetchAllRows('publishers', 'romaji'),
    fetchAllRows('service_reports', 'year'),
  ])
  // 設定は無くても支障がないため、失敗しても書き出しは続ける
  let reportRules: Record<string, unknown>[] = []
  try {
    reportRules = await fetchAllRows('report_rules', 'id')
  } catch {
    reportRules = []
  }
  return { exportedAt: new Date().toISOString(), groups, publishers, serviceReports, reportRules }
}

// Excelで開けるようCSVにする。区切り文字・引用符・改行を含む値は引用符で囲んで二重化する
function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = Array.isArray(value) ? value.join(' ') : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return ''
  const keys = columns ?? Object.keys(rows[0])
  const lines = [keys.join(','), ...rows.map((r) => keys.map((k) => toCsvValue(r[k])).join(','))]
  return lines.join('\r\n')
}

export function downloadFile(fileName: string, content: string, mime: string) {
  // ExcelがUTF-8と判断できるようBOMを付ける(付けないと日本語が文字化けする)
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + content : content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // クリック直後に取り消すと保存に失敗する端末があるため、少し待ってから解放する
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- 保存期間と、年度単位での削除 ----
// 組織の指示により、奉仕報告は最低13か月・最長36か月保存する。
// 13か月とはS-21の「上段=前年度の12か月 + 下段=今年度の9月分」の状態を指すため、
// 年度で数えると「当年度と前年度は必ず残す」「3年度分までは持てる」ことになる。
// 削除は年度単位(12か月分)で行い、この範囲に反する年度を選んだ場合は警告する。

export type RetentionStatus = 'deletable' | 'withinRetention' | 'required'

export function retentionStatus(year: number, currentYear: number): RetentionStatus {
  // 当年度・前年度は伝道者記録に必要なので消してはいけない
  if (year >= currentYear - 1) return 'required'
  // 前々年度は36か月の保存範囲内(消しても13か月は下回らないが、保存期間内ではある)
  if (year === currentYear - 2) return 'withinRetention'
  return 'deletable'
}

export interface YearCount {
  year: number
  count: number
}

/** 報告が存在する年度と件数を古い順に返す */
export async function fetchReportYearCounts(): Promise<YearCount[]> {
  const bounds = await Promise.all(
    [true, false].map((asc) =>
      supabase
        .from('service_reports')
        .select('year')
        .order('year', { ascending: asc })
        .limit(1)
        .returns<{ year: number }[]>(),
    ),
  )
  for (const b of bounds) if (b.error) throw b.error
  const oldest = bounds[0].data?.[0]?.year
  const newest = bounds[1].data?.[0]?.year
  if (oldest === undefined || newest === undefined) return []

  // 全件を取って数えると1000件の上限に当たるため、年度ごとに件数だけ問い合わせる
  const result: YearCount[] = []
  for (let y = oldest; y <= newest; y += 1) {
    const { count, error } = await supabase
      .from('service_reports')
      .select('*', { count: 'exact', head: true })
      .eq('year', y)
    if (error) throw error
    if (count && count > 0) result.push({ year: y, count })
  }
  return result
}

/** 指定した年度の報告(12か月分)を削除する。取り消せないので必ず事前に確認すること */
export async function deleteReportsOfYear(year: number): Promise<void> {
  const { error } = await supabase.from('service_reports').delete().eq('year', year)
  if (error) throw error
}

export function backupFileStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
}
