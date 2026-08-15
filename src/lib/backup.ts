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

export function backupFileStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
}
